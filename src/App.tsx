import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronRight, Clock3, Flame, RefreshCw } from 'lucide-react';

type Competition = 'All' | 'Champions League' | 'Europa League' | 'Premier League' | 'Serie A' | 'La Liga';
type View = 'played' | 'today' | 'coming';
type TimeMode = 'sofia' | 'local';
type Fixture = { id: string; date: string; time: string; kickoff?: string | null; competition: string; home: string; away: string; venue: string; heat: number; note: string; homeBadge?: string | null; awayBadge?: string | null; homeScore: number | null; awayScore: number | null; status: string };
type FixtureData = { generatedAt: string; timezone: string; from: string; to: string; fixtures: Fixture[] };

const competitions: Competition[] = ['All', 'Champions League', 'Europa League', 'Premier League', 'Serie A', 'La Liga'];
const views: { id: View; label: string }[] = [{ id: 'played', label: 'Played' }, { id: 'today', label: 'Today' }, { id: 'coming', label: 'Coming' }];

function todayKey() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Sofia', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function dateLabel(date: string, today: string) {
  const parsed = new Date(`${date}T12:00:00Z`);
  const tomorrow = new Date(`${today}T12:00:00Z`); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  if (date === today) return 'Today';
  if (date === tomorrow.toISOString().slice(0, 10)) return 'Tomorrow';
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(parsed);
}

function hasScore(match: Fixture) { return Number.isFinite(match.homeScore) && Number.isFinite(match.awayScore); }
function kickoffTime(match: Fixture, mode: TimeMode) {
  if (!match.kickoff) return match.time;
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: mode === 'sofia' ? 'Europe/Sofia' : undefined,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(match.kickoff));
}
function resultClass(match: Fixture, side: 'home' | 'away') {
  if (!hasScore(match) || match.homeScore === match.awayScore) return '';
  const won = side === 'home' ? match.homeScore! > match.awayScore! : match.awayScore! > match.homeScore!;
  return won ? 'winner' : 'loser';
}

export default function App() {
  const [view, setView] = useState<View>('today');
  const [competition, setCompetition] = useState<Competition>('All');
  const [timeMode, setTimeMode] = useState<TimeMode>(() => window.localStorage.getItem('matchday-timezone') === 'local' ? 'local' : 'sofia');
  const [data, setData] = useState<FixtureData | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const today = todayKey();

  const loadFixtures = useCallback(async () => {
    setLoading(true); setFailed(false);
    try {
      const response = await fetch(`/data/fixtures.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error();
      setData(await response.json());
    } catch { setFailed(true); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadFixtures(); }, [loadFixtures]);
  useEffect(() => { const timer = window.setInterval(() => void loadFixtures(), 300_000); return () => window.clearInterval(timer); }, [loadFixtures]);
  useEffect(() => { window.localStorage.setItem('matchday-timezone', timeMode); }, [timeMode]);

  const buckets = useMemo(() => {
    const all = data?.fixtures ?? [];
    return {
      played: all.filter((match) => match.date < today),
      today: all.filter((match) => match.date === today),
      coming: all.filter((match) => match.date > today),
    };
  }, [data, today]);

  const visible = useMemo(() => buckets[view]
    .filter((match) => competition === 'All' || match.competition === competition)
    .sort((a, b) => view === 'played' ? `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`) : `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)), [buckets, view, competition]);
  const grouped = useMemo(() => Object.entries(visible.reduce<Record<string, Fixture[]>>((groups, match) => ({ ...groups, [match.date]: [...(groups[match.date] ?? []), match] }), {})), [visible]);
  const topPick = visible.reduce<Fixture | undefined>((best, match) => !best || match.heat > best.heat ? match : best, undefined);
  const updated = data?.generatedAt ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Sofia', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(data.generatedAt)) : null;

  return (
    <main className="app">
      <header className="site-header"><a className="brand" href="https://mincho.dev"><span className="brand-mark">M</span><span>mincho.dev / matchday</span></a><div className="header-tools"><div className="timezone-toggle" role="group" aria-label="Kickoff timezone"><button className={timeMode === 'sofia' ? 'active' : ''} onClick={() => setTimeMode('sofia')}>Sofia</button><button className={timeMode === 'local' ? 'active' : ''} onClick={() => setTimeMode('local')}>Local</button></div><div className="live-pill"><span /> {loading ? 'Loading matchday…' : updated ? `Updated ${updated}` : 'Daily fixture archive'}</div></div></header>
      <section className="page-shell">
        <div className="intro-row"><div><p className="eyebrow">YOUR FOOTBALL GAMEWEEK</p><h1>What’s worth<br />watching?</h1></div><p className="intro-copy">Last week’s scores, today’s action and the next seven days across Europe. All kickoffs are Sofia time.</p></div>

        <div className="controls"><nav className="view-tabs" aria-label="Match period">{views.map((item) => <button key={item.id} onClick={() => setView(item.id)} className={view === item.id ? 'active' : ''}><span>{item.label}</span><small>{buckets[item.id].length}</small></button>)}</nav><button className="refresh" onClick={() => void loadFixtures()}><RefreshCw size={17} className={loading ? 'spin' : ''} /> {loading ? 'Checking' : 'Refresh'}</button></div>
        <nav className="competition-tabs" aria-label="Competitions">{competitions.map((item) => <button key={item} onClick={() => setCompetition(item)} className={competition === item ? 'active' : ''}>{item}</button>)}</nav>

        {topPick && <article className="spotlight"><div className="spotlight-label"><Flame size={15} fill="currentColor" /> TOP PICK · {topPick.heat}% MATCH HEAT</div><div className="spotlight-main"><div className={`team ${resultClass(topPick, 'home')}`}><span className="crest cream">{topPick.home.slice(0, 3).toUpperCase()}</span><strong>{topPick.home}</strong></div><div className="kickoff"><small>{dateLabel(topPick.date, today)} · {topPick.competition}</small><b>{hasScore(topPick) ? `${topPick.homeScore}–${topPick.awayScore}` : kickoffTime(topPick, timeMode)}</b><span>{hasScore(topPick) ? topPick.status : <><Clock3 size={13} /> {timeMode === 'sofia' ? 'Sofia time' : 'Your local time'}</>}</span></div><div className={`team ${resultClass(topPick, 'away')}`}><span className="crest red">{topPick.away.slice(0, 3).toUpperCase()}</span><strong>{topPick.away}</strong></div></div><footer><span>{topPick.note}</span><span>{topPick.venue} <ChevronRight size={15} /></span></footer></article>}

        <div className="section-heading"><div><p className="eyebrow">{view === 'played' ? 'LAST 7 DAYS' : view === 'today' ? 'MATCHDAY' : 'NEXT 7 DAYS'}</p><h2>{view === 'played' ? 'Recent results' : view === 'today' ? 'Today’s games' : 'Coming up'}</h2></div><span>{visible.length} matches selected</span></div>
        <section className="fixture-groups" aria-live="polite">
          {grouped.map(([date, matches]) => <section className="date-group" key={date}><header><strong>{dateLabel(date, today)}</strong><span>{matches.length} {matches.length === 1 ? 'match' : 'matches'}</span></header><div className="fixture-list">{matches.map((match) => <article className="fixture" key={`${match.id}-${match.date}`}><div className={hasScore(match) ? 'score-cell' : view === 'played' ? 'score-cell pending' : ''}>{hasScore(match) ? <><b>{match.homeScore}–{match.awayScore}</b><small>{match.status}</small></> : view === 'played' ? <><b>—</b><small>Result pending</small></> : <time>{kickoffTime(match, timeMode)}</time>}</div><div className="fixture-teams"><span className={resultClass(match, 'home')}><i className="mini-crest">{match.home[0]}</i>{match.home}</span><span className={resultClass(match, 'away')}><i className="mini-crest away">{match.away[0]}</i>{match.away}</span></div><div className="fixture-meta"><span>{match.competition}</span><small>{match.note}</small></div><div className="heat"><Flame size={14} /> {match.heat}</div><span className="fixture-arrow"><ChevronRight size={20} /></span></article>)}</div></section>)}
          {!loading && !visible.length && <div className="empty"><CalendarDays size={28} /><strong>{failed ? 'Couldn’t load the fixture archive' : `No ${view} games in this competition`}</strong><span>{failed ? 'Use Refresh to try again.' : 'Try another competition.'}</span></div>}
        </section>
        <p className="data-note">TheSportsDB free data · Updated daily · {timeMode === 'sofia' ? 'Europe/Sofia time' : 'Your device time'}</p>
      </section>
    </main>
  );
}
