import { mkdir, readFile, writeFile } from 'node:fs/promises';

const OUTPUT = new URL('../public/data/fixtures.json', import.meta.url);
const TIMEZONE = 'Europe/Sofia';
const leagues = [
  { id: '4480', name: 'Champions League' },
  { id: '4481', name: 'Europa League' },
  { id: '4328', name: 'Premier League' },
  { id: '4332', name: 'Serie A' },
  { id: '4335', name: 'La Liga' },
];

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function dateKey(offset) {
  const date = new Date(Date.now() + offset * 86_400_000);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function heatFor(event) {
  const names = `${event.strHomeTeam} ${event.strAwayTeam}`.toLowerCase();
  const heavyweight = ['real madrid', 'barcelona', 'liverpool', 'arsenal', 'manchester', 'chelsea', 'inter', 'milan', 'juventus', 'napoli', 'bayern', 'paris', 'tottenham', 'atletico'];
  return Math.min(98, 72 + heavyweight.filter((club) => names.includes(club)).length * 9 + (event.strLeague?.includes('Champions') ? 8 : 0));
}

function sofiaTime(event) {
  if (!event.strTimestamp) return (event.strTime ?? '').slice(0, 5) || 'TBA';
  const timestamp = event.strTimestamp.endsWith('Z') ? event.strTimestamp : `${event.strTimestamp}Z`;
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(timestamp));
}

function kickoffTimestamp(event) {
  if (!event.strTimestamp) return null;
  return event.strTimestamp.endsWith('Z') ? event.strTimestamp : `${event.strTimestamp}Z`;
}

async function fetchLeague(date, league, attempt = 1) {
  const url = `https://www.thesportsdb.com/api/v1/json/123/eventsday.php?d=${date}&l=${league.id}`;
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) {
    if (attempt < 3) {
      await delay(attempt * 5_000);
      return fetchLeague(date, league, attempt + 1);
    }
    throw new Error(`${league.name} returned ${response.status}`);
  }
  const data = await response.json();
  return (data.events ?? []).map((event) => ({
    id: event.idEvent,
    date,
    time: sofiaTime(event),
    kickoff: kickoffTimestamp(event),
    competition: league.name,
    home: event.strHomeTeam,
    away: event.strAwayTeam,
    venue: event.strVenue || 'Venue TBA',
    heat: heatFor(event),
    note: event.strLeague?.includes('Champions') || event.strLeague?.includes('Europa') ? 'European night' : 'League football',
    homeBadge: event.strHomeTeamBadge || null,
    awayBadge: event.strAwayTeamBadge || null,
    homeScore: event.intHomeScore == null ? null : Number(event.intHomeScore),
    awayScore: event.intAwayScore == null ? null : Number(event.intAwayScore),
    status: event.strStatus || (event.intHomeScore != null ? 'Finished' : 'Scheduled'),
  }));
}

async function fetchResult(fixture) {
  const response = await fetch(`https://www.thesportsdb.com/api/v1/json/123/lookupevent.php?id=${fixture.id}`, { headers: { accept: 'application/json' } });
  if (!response.ok) return fixture;
  const event = (await response.json()).events?.[0];
  if (!event || event.intHomeScore == null || event.intAwayScore == null) return fixture;
  return {
    ...fixture,
    homeScore: Number(event.intHomeScore),
    awayScore: Number(event.intAwayScore),
    status: event.strStatus || 'FT',
    kickoff: kickoffTimestamp(event) || fixture.kickoff,
  };
}

async function existingFixtures() {
  try {
    const stored = JSON.parse(await readFile(OUTPUT, 'utf8'));
    return Array.isArray(stored.fixtures) ? stored.fixtures : [];
  } catch {
    return [];
  }
}

const dates = Array.from({ length: 15 }, (_, index) => dateKey(index - 7));
const previous = await existingFixtures();
const collected = [];

for (const [index, date] of dates.entries()) {
  const results = await Promise.allSettled(leagues.map((league) => fetchLeague(date, league)));
  results.forEach((result, leagueIndex) => {
    if (result.status === 'fulfilled') collected.push(...result.value);
    else console.warn(`${date}: ${leagues[leagueIndex].name} failed: ${result.reason.message}`);
  });
  console.log(`${date}: ${collected.filter((fixture) => fixture.date === date).length} fixtures`);
  if (index < dates.length - 1) await delay(10_500);
}

if (!collected.length) throw new Error('No fixture data was returned; keeping the current archive.');

const resultCutoff = dateKey(0);
for (let index = 0; index < collected.length; index += 1) {
  const fixture = collected[index];
  if (fixture.date < resultCutoff && (fixture.homeScore == null || fixture.awayScore == null)) {
    collected[index] = await fetchResult(fixture);
    await delay(2_100);
  }
}

const inRange = new Set(dates);
const merged = new Map(previous.filter((fixture) => inRange.has(fixture.date)).map((fixture) => [`${fixture.id}:${fixture.date}`, fixture]));
for (const fixture of collected) {
  const key = `${fixture.id}:${fixture.date}`;
  const stored = merged.get(key);
  const keepStoredResult = fixture.homeScore == null && fixture.awayScore == null && stored?.homeScore != null && stored?.awayScore != null;
  merged.set(key, keepStoredResult ? { ...fixture, homeScore: stored.homeScore, awayScore: stored.awayScore, status: stored.status } : fixture);
}
const fixtures = [...merged.values()].sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));

await mkdir(new URL('../public/data/', import.meta.url), { recursive: true });
await writeFile(OUTPUT, `${JSON.stringify({ generatedAt: new Date().toISOString(), timezone: TIMEZONE, from: dates[0], to: dates.at(-1), fixtures }, null, 2)}\n`);
console.log(`Saved ${fixtures.length} fixtures from ${dates[0]} through ${dates.at(-1)}.`);
