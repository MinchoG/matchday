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
const EUROPA_LEAGUE = { id: '4481', name: 'Europa League' };

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

function mapSportsDbEvent(event, date) {
  const kickoff = event.strTimestamp ? (event.strTimestamp.endsWith('Z') ? event.strTimestamp : `${event.strTimestamp}Z`) : null;
  const homeScore = event.intHomeScore == null ? null : Number(event.intHomeScore);
  const awayScore = event.intAwayScore == null ? null : Number(event.intAwayScore);
  return {
    id: `tsdb-${event.idEvent}`,
    date,
    time: kickoff ? timeInSofia(kickoff) : (event.strTime ?? '').slice(0, 5) || 'TBA',
    kickoff,
    competition: EUROPA_LEAGUE.name,
    home: event.strHomeTeam,
    away: event.strAwayTeam,
    venue: event.strVenue || 'Venue TBA',
    heat: heatFor(event.strHomeTeam, event.strAwayTeam, EUROPA_LEAGUE.name),
    note: 'European night',
    homeBadge: event.strHomeTeamBadge || null,
    awayBadge: event.strAwayTeamBadge || null,
    homeScore,
    awayScore,
    status: event.strStatus || (homeScore != null && awayScore != null ? 'FT' : 'NS'),
  };
}

async function fetchEuropa(date) {
  const url = `https://www.thesportsdb.com/api/v1/json/123/eventsday.php?d=${date}&l=${EUROPA_LEAGUE.id}`;
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`TheSportsDB returned ${response.status}`);
  const data = await response.json();
  return (data.events ?? []).map((event) => mapSportsDbEvent(event, date));
}

async function existingEuropa(dates) {
  try {
    const stored = JSON.parse(await readFile(OUTPUT, 'utf8'));
    return (stored.fixtures ?? []).filter((fixture) => fixture.competition === EUROPA_LEAGUE.name && dates.has(fixture.date));
  } catch {
    return [];
  }
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

const europa = [];
let europaFailures = 0;
for (const [index, date] of dateList.entries()) {
  try {
    europa.push(...await fetchEuropa(date));
  } catch (error) {
    europaFailures += 1;
    console.warn(`Europa League ${date}: ${error.message}`);
  }
  if (index < dateList.length - 1) await delay(2_100);
}

if (europaFailures === dateList.length) europa.push(...await existingEuropa(dates));
const unique = new Map([...primary, ...europa]
  .filter((fixture) => dates.has(fixture.date) && fixture.home && fixture.away)
  .map((fixture) => [`${fixture.competition}:${fixture.date}:${fixture.home}:${fixture.away}`, fixture]));
const fixtures = [...unique.values()].sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));

if (!primary.length) throw new Error('No primary fixture data was returned; keeping the current archive.');
await mkdir(new URL('../public/data/', import.meta.url), { recursive: true });
await writeFile(OUTPUT, `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  timezone: TIMEZONE,
  from: dateList[0],
  to: dateList.at(-1),
  sources: ['football-data.org', 'TheSportsDB (Europa League fallback)'],
  fixtures,
}, null, 2)}\n`);
console.log(`Saved ${fixtures.length} fixtures from ${dateList[0]} through ${dateList.at(-1)}.`);
