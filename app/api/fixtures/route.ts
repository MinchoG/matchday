const leagueMap: Record<string, string> = {
  'UEFA Champions League': 'Champions League',
  'UEFA Europa League': 'Europa League',
  'English Premier League': 'Premier League',
  'Italian Serie A': 'Serie A',
  'Spanish La Liga': 'La Liga',
};

type SportsDbEvent = {
  idEvent: string;
  strLeague: string;
  strHomeTeam: string;
  strAwayTeam: string;
  strTimestamp?: string;
  strTime?: string;
  strVenue?: string;
  strHomeTeamBadge?: string;
  strAwayTeamBadge?: string;
};

function heatFor(event: SportsDbEvent) {
  const names = `${event.strHomeTeam} ${event.strAwayTeam}`.toLowerCase();
  const heavyweight = ['real madrid', 'barcelona', 'liverpool', 'arsenal', 'manchester', 'chelsea', 'inter', 'milan', 'juventus', 'napoli', 'bayern', 'paris', 'tottenham', 'atletico'];
  return Math.min(98, 72 + heavyweight.filter((club) => names.includes(club)).length * 9 + (event.strLeague.includes('Champions') ? 8 : 0));
}

function sofiaTime(event: SportsDbEvent) {
  if (!event.strTimestamp) return (event.strTime ?? '').slice(0, 5);
  const timestamp = event.strTimestamp.endsWith('Z') ? event.strTimestamp : `${event.strTimestamp}Z`;
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Sofia', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(timestamp));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const date = url.searchParams.get('date');
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return Response.json({ error: 'Invalid date' }, { status: 400 });

  try {
    const response = await fetch(`https://www.thesportsdb.com/api/v1/json/123/eventsday.php?d=${date}&s=Soccer`, { headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error('Schedule provider unavailable');
    const data = await response.json() as { events: SportsDbEvent[] | null };
    const fixtures = (data.events ?? []).filter((event) => leagueMap[event.strLeague]).map((event) => ({
      id: event.idEvent,
      time: sofiaTime(event),
      competition: leagueMap[event.strLeague],
      home: event.strHomeTeam,
      away: event.strAwayTeam,
      venue: event.strVenue || 'Venue TBA',
      heat: heatFor(event),
      note: event.strLeague.includes('Champions') || event.strLeague.includes('Europa') ? 'European night' : 'League football',
      homeBadge: event.strHomeTeamBadge,
      awayBadge: event.strAwayTeamBadge,
    }));
    return Response.json({ fixtures, source: 'live' }, { headers: { 'Cache-Control': 'public, max-age=300' } });
  } catch {
    return Response.json({ fixtures: [], source: 'unavailable' }, { status: 503 });
  }
}
