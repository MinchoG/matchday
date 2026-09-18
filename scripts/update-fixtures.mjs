import { mkdir, readFile, writeFile } from 'node:fs/promises';

const OUTPUT = new URL('../public/data/fixtures.json', import.meta.url);
const TIMEZONE = 'Europe/Sofia';
const FOOTBALL_DATA_TOKEN = process.env.FREE_FOOTBALL_API_TOKEN;
const FOOTBALL_DATA_CODES = new Map([
  ['CL', 'Champions League'],
  ['PL', 'Premier League'],
  ['SA', 'Serie A'],
  ['PD', 'La Liga'],
]);
const SPORTS_DB_LEAGUES = [
  { id: '4480', name: 'Champions League' },
  { id: '4481', name: 'Europa League' },
  { id: '4328', name: 'Premier League' },
  { id: '4332', name: 'Serie A' },
  { id: '4335', name: 'La Liga' },
];
const TV_SOURCES = {
  maxSport: { url: 'https://maxsport.live/tv-guide/', channels: { 340: 'MAX Sport 1', 110: 'MAX Sport 2', 100: 'MAX Sport 3', 90: 'MAX Sport 4' } },
  diema: [
    { url: 'https://diemaxtra.nova.bg/diemasport/schedule', channel: 'DIEMA SPORT' },
    { url: 'https://diemaxtra.nova.bg/diemasport2/schedule', channel: 'DIEMA SPORT 2' },
    { url: 'https://diemaxtra.nova.bg/diemasport3/schedule', channel: 'DIEMA SPORT 3' },
  ],
};

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function dateKey(offset) {
  const date = new Date(Date.now() + offset * 86_400_000);
  return dateInZone(date);
}

function dateInZone(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function timeInSofia(timestamp) {
  if (!timestamp) return 'TBA';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(timestamp));
}

function heatFor(home, away, competition) {
  const names = `${home} ${away}`.toLowerCase();
  const heavyweight = ['real madrid', 'barcelona', 'liverpool', 'arsenal', 'manchester', 'chelsea', 'inter', 'milan', 'juventus', 'napoli', 'bayern', 'paris', 'tottenham', 'atletico'];
  return Math.min(98, 72 + heavyweight.filter((club) => names.includes(club)).length * 9 + (competition === 'Champions League' ? 8 : 0));
}

function shortStatus(status, hasScore) {
  const statuses = {
    FINISHED: 'FT',
    IN_PLAY: 'LIVE',
    PAUSED: 'HT',
    POSTPONED: 'Postponed',
    SUSPENDED: 'Suspended',
    CANCELLED: 'Cancelled',
  };
  return statuses[status] || (hasScore ? 'FT' : 'NS');
}

function decodeHtml(value) {
  return value.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#8211;|&ndash;/g, '-').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

function transliterate(value) {
  const map = { а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'ts',ч:'ch',ш:'sh',щ:'sht',ъ:'a',ь:'',ю:'yu',я:'ya' };
  return [...value.toLowerCase()].map((letter) => map[letter] ?? letter).join('');
}

function normalizedTeam(value) {
  return transliterate(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\b(fc|cf|afc|ac|calcio|club|ud|rcd|us|ss|fk|sk)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function editDistance(left, right) {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = row[0]; row[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const above = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (left[i - 1] === right[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return row[right.length];
}

function teamSimilarity(left, right) {
  const a = normalizedTeam(left); const b = normalizedTeam(right);
  if (!a || !b) return 0;
  if (a.includes(b) || b.includes(a)) return Math.min(a.length, b.length) / Math.max(a.length, b.length);
  return 1 - editDistance(a, b) / Math.max(a.length, b.length);
}

function listingDate(dayMonth) {
  const [day, month] = dayMonth.split('.').map(Number);
  const now = new Date();
  let year = Number(new Intl.DateTimeFormat('en', { timeZone: TIMEZONE, year: 'numeric' }).format(now));
  const currentMonth = Number(new Intl.DateTimeFormat('en', { timeZone: TIMEZONE, month: 'numeric' }).format(now));
  if (currentMonth === 12 && month === 1) year += 1;
  if (currentMonth === 1 && month === 12) year -= 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseTeams(title) {
  const cleaned = decodeHtml(title).replace(/^ПРЯКО,?\s*/i, '').replace(/^LIVE,?\s*/i, '');
  const match = cleaned.match(/(?:^|:\s*)([^:]+?)\s+-\s+([^:]+)$/);
  return match ? [match[1].trim(), match[2].trim()] : null;
}

function parseMaxSport(html) {
  const listings = [];
  for (const [id, channel] of Object.entries(TV_SOURCES.maxSport.channels)) {
    const marker = `id="tv-${id}-panel-`;
    let position = html.indexOf(marker);
    while (position >= 0) {
      const date = html.slice(position + marker.length, position + marker.length + 5);
      const next = html.indexOf('id="tv-', position + marker.length);
      const panel = html.slice(position, next < 0 ? html.length : next);
      const pattern = /<div class="guides-item guides-live">[\s\S]*?<div class="guides-item-time">\s*([^<]+)[\s\S]*?<div class="guides-item-title">([\s\S]*?)<\/div>/g;
      for (const match of panel.matchAll(pattern)) {
        const teams = parseTeams(match[2]);
        if (teams) listings.push({ date: listingDate(date), time: match[1].trim(), teams, channel, source: 'MAX Sport', sourceUrl: TV_SOURCES.maxSport.url });
      }
      position = next;
    }
  }
  return listings;
}

const bgMonths = { ян:1, фев:2, март:3, апр:4, май:5, юни:6, юли:7, авг:8, септ:9, окт:10, ное:11, дек:12 };
function parseDiema(html, source) {
  const dates = new Map([...html.matchAll(/href="#([a-z]+)"[\s\S]*?<span class="date">(\d+)\s+([^<]+)/g)].map((match) => [match[1], `${String(match[2]).padStart(2, '0')}.${String(bgMonths[match[3].trim().slice(0, 4)]).padStart(2, '0')}`]));
  const listings = [];
  for (const [dayId, dayMonth] of dates) {
    const marker = `class="tab-pane fade`;
    const idPosition = html.indexOf(`id="${dayId}"`);
    if (idPosition < 0) continue;
    const start = html.lastIndexOf(marker, idPosition);
    const next = html.indexOf(marker, idPosition + dayId.length);
    const panel = html.slice(start, next < 0 ? html.length : next);
    const pattern = /<li>[\s\S]*?<p class="time">\s*([^<]+)<\/p>[\s\S]*?<p class="title">([\s\S]*?)<\/p>[\s\S]*?<p class="description">([\s\S]*?)<\/p>[\s\S]*?<\/li>/g;
    for (const match of panel.matchAll(pattern)) {
      if (!/директно/i.test(decodeHtml(match[3]))) continue;
      const teams = parseTeams(match[2]);
      if (teams) listings.push({ date: listingDate(dayMonth), time: match[1].trim().replace('.', ':'), teams, channel: source.channel, source: 'DIEMA XTRA', sourceUrl: source.url });
    }
  }
  return listings;
}

async function fetchBulgarianTv() {
  const listings = [];
  try {
    const response = await fetch(TV_SOURCES.maxSport.url, { headers: { accept: 'text/html', 'user-agent': 'Matchday/1.0 (+https://matchday.mincho.dev)' } });
    if (response.ok) listings.push(...parseMaxSport(await response.text()));
  } catch (error) { console.warn(`MAX Sport schedule: ${error.message}`); }
  for (const source of TV_SOURCES.diema) {
    try {
      const response = await fetch(source.url, { headers: { accept: 'text/html', 'user-agent': 'Matchday/1.0 (+https://matchday.mincho.dev)' } });
      if (response.ok) listings.push(...parseDiema(await response.text(), source));
    } catch (error) { console.warn(`${source.channel} schedule: ${error.message}`); }
  }
  for (const date of dateList.slice(7)) {
    try {
      const response = await fetch(`https://www.thesportsdb.com/api/v1/json/123/eventstv.php?d=${date}&s=Soccer&a=Bulgaria`, { headers: { accept: 'application/json' } });
      if (!response.ok) continue;
      const data = await response.json();
      for (const event of data.tvevents ?? []) {
        const teams = parseTeams(event.strEvent?.replace(' vs ', ' - ') ?? '');
        if (teams) listings.push({ date, time: (event.strTime ?? '').slice(0, 5), teams, channel: event.strChannel, source: 'TheSportsDB', sourceUrl: 'https://www.thesportsdb.com/' });
      }
    } catch (error) { console.warn(`TheSportsDB TV ${date}: ${error.message}`); }
  }
  return listings;
}

function attachTv(fixtures, listings) {
  return fixtures.map((fixture) => {
    const candidates = listings.filter((listing) => listing.date === fixture.date && teamSimilarity(fixture.home, listing.teams[0]) >= .55 && teamSimilarity(fixture.away, listing.teams[1]) >= .55);
    const minutes = (time) => { const [hour, minute] = time.split(':').map(Number); return hour * 60 + minute; };
    const best = candidates.sort((a, b) => Math.abs(minutes(a.time) - minutes(fixture.time)) - Math.abs(minutes(b.time) - minutes(fixture.time)))[0];
    return { ...fixture, tv: best ? { channel: best.channel, source: best.source, sourceUrl: best.sourceUrl } : null };
  });
}

function mapFootballDataMatch(match) {
  const competition = FOOTBALL_DATA_CODES.get(match.competition?.code);
  if (!competition || !match.utcDate) return null;
  const homeScore = match.score?.fullTime?.home ?? null;
  const awayScore = match.score?.fullTime?.away ?? null;
  const hasScore = homeScore != null && awayScore != null;
  return {
    id: `fd-${match.id}`,
    date: dateInZone(new Date(match.utcDate)),
    time: timeInSofia(match.utcDate),
    kickoff: match.utcDate,
    competition,
    home: match.homeTeam?.name || match.homeTeam?.shortName,
    away: match.awayTeam?.name || match.awayTeam?.shortName,
    venue: match.venue || 'Venue TBA',
    heat: heatFor(match.homeTeam?.name, match.awayTeam?.name, competition),
    note: competition === 'Champions League' ? 'European night' : 'League football',
    homeBadge: match.homeTeam?.crest || null,
    awayBadge: match.awayTeam?.crest || null,
    homeScore,
    awayScore,
    status: shortStatus(match.status, hasScore),
  };
}

async function fetchFootballData(from, to) {
  if (!FOOTBALL_DATA_TOKEN) throw new Error('FREE_FOOTBALL_API_TOKEN is required');
  const url = `https://api.football-data.org/v4/matches?competitions=PL,PD,SA,CL&dateFrom=${from}&dateTo=${to}`;
  const response = await fetch(url, { headers: { 'X-Auth-Token': FOOTBALL_DATA_TOKEN, accept: 'application/json' } });
  if (!response.ok) throw new Error(`football-data.org returned ${response.status}`);
  const data = await response.json();
  return (data.matches ?? []).map(mapFootballDataMatch).filter(Boolean);
}

function mapSportsDbEvent(event, date, competition) {
  const kickoff = event.strTimestamp ? (event.strTimestamp.endsWith('Z') ? event.strTimestamp : `${event.strTimestamp}Z`) : null;
  const homeScore = event.intHomeScore == null ? null : Number(event.intHomeScore);
  const awayScore = event.intAwayScore == null ? null : Number(event.intAwayScore);
  return {
    id: `tsdb-${event.idEvent}`,
    date,
    time: kickoff ? timeInSofia(kickoff) : (event.strTime ?? '').slice(0, 5) || 'TBA',
    kickoff,
    competition,
    home: event.strHomeTeam,
    away: event.strAwayTeam,
    venue: event.strVenue || 'Venue TBA',
    heat: heatFor(event.strHomeTeam, event.strAwayTeam, competition),
    note: competition === 'Champions League' || competition === 'Europa League' ? 'European night' : 'League football',
    homeBadge: event.strHomeTeamBadge || null,
    awayBadge: event.strAwayTeamBadge || null,
    homeScore,
    awayScore,
    status: event.strStatus || (homeScore != null && awayScore != null ? 'FT' : 'NS'),
  };
}

async function fetchSportsDb(date, league) {
  const url = `https://www.thesportsdb.com/api/v1/json/123/eventsday.php?d=${date}&l=${league.id}`;
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`TheSportsDB returned ${response.status}`);
  const data = await response.json();
  return (data.events ?? []).map((event) => mapSportsDbEvent(event, date, league.name));
}

async function existingFallback(dates) {
  try {
    const stored = JSON.parse(await readFile(OUTPUT, 'utf8'));
    return (stored.fixtures ?? []).filter((fixture) => dates.has(fixture.date));
  } catch {
    return [];
  }
}

function bucketKey(fixture) {
  return `${fixture.competition}:${fixture.date}`;
}

function preferMoreComplete(primary, fallback) {
  const primaryBuckets = Map.groupBy(primary, bucketKey);
  const fallbackBuckets = Map.groupBy(fallback, bucketKey);
  const keys = new Set([...primaryBuckets.keys(), ...fallbackBuckets.keys()]);
  return [...keys].flatMap((key) => {
    const preferred = primaryBuckets.get(key) ?? [];
    const alternative = fallbackBuckets.get(key) ?? [];
    return alternative.length > preferred.length ? alternative : preferred;
  });
}

const dateList = Array.from({ length: 15 }, (_, index) => dateKey(index - 7));
const dates = new Set(dateList);
const primary = [];
const windows = [[dateList[0], dateList[7]], [dateList[8], dateList[14]]];

for (const [index, [from, to]] of windows.entries()) {
  primary.push(...await fetchFootballData(from, to));
  console.log(`football-data.org ${from} through ${to}: ${primary.length} matches collected`);
  if (index === 0) await delay(6_100);
}

const fallback = [];
let fallbackFailures = 0;
let fallbackRequests = 0;
for (const date of dateList) {
  for (const league of SPORTS_DB_LEAGUES) {
    try {
      fallback.push(...await fetchSportsDb(date, league));
    } catch (error) {
      fallbackFailures += 1;
      console.warn(`${league.name} ${date}: ${error.message}`);
    }
    fallbackRequests += 1;
    if (fallbackRequests < dateList.length * SPORTS_DB_LEAGUES.length) await delay(2_100);
  }
}

if (fallbackFailures === dateList.length * SPORTS_DB_LEAGUES.length) fallback.push(...await existingFallback(dates));
const selected = preferMoreComplete(primary, fallback);
const unique = new Map(selected
  .filter((fixture) => dates.has(fixture.date) && fixture.home && fixture.away)
  .map((fixture) => [`${fixture.competition}:${fixture.date}:${fixture.home}:${fixture.away}`, fixture]));
const tvListings = await fetchBulgarianTv();
const fixtures = attachTv([...unique.values()].sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)), tvListings);

if (!primary.length) throw new Error('No primary fixture data was returned; keeping the current archive.');
await mkdir(new URL('../public/data/', import.meta.url), { recursive: true });
await writeFile(OUTPUT, `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  timezone: TIMEZONE,
  from: dateList[0],
  to: dateList.at(-1),
  sources: ['football-data.org', 'TheSportsDB completeness fallback', 'MAX Sport and DIEMA official TV schedules'],
  fixtures,
}, null, 2)}\n`);
console.log(`Saved ${fixtures.length} fixtures from ${dateList[0]} through ${dateList.at(-1)}.`);
