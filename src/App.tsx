import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronRight, Clock3, Flame, RefreshCw } from 'lucide-react';

type Competition = 'All' | 'Champions League' | 'Europa League' | 'Premier League' | 'Serie A' | 'La Liga';
type Fixture = { id: string; time: string; competition: string; home: string; away: string; homeCode: string; awayCode: string; venue: string; heat: number; note: string; homeScore: number | null; awayScore: number | null; status: string };
const competitions: Competition[] = ['All', 'Champions League', 'Europa League', 'Premier League', 'Serie A', 'La Liga'];
const days = [0, 1, 2, 3, 4, 5, 6];

function dateAt(offset: number) { return new Date(Date.now() + offset * 86400000); }
function dateKey(offset: number) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Sofia', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(dateAt(offset));
  return `${parts.find((p) => p.type === 'year')?.value}-${parts.find((p) => p.type === 'month')?.value}-${parts.find((p) => p.type === 'day')?.value}`;
}
function dayName(offset: number) { return offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : new Intl.DateTimeFormat('en-GB', { weekday: 'short' }).format(dateAt(offset)); }
function dayDate(offset: number) { return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(dateAt(offset)); }
function hasScore(match: Fixture) { return Number.isFinite(match.homeScore) && Number.isFinite(match.awayScore); }

export default function App() {
  const [day, setDay] = useState(0);
  const [competition, setCompetition] = useState<Competition>('All');
  const [fixturesByDay, setFixturesByDay] = useState<Record<number, Fixture[]>>({});
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const loadFixtures = useCallback(async (offset: number) => {
    setLoading(true); setFailed(false);
    try {
      const response = await fetch(`/api/fixtures?date=${dateKey(offset)}`);
      if (!response.ok) throw new Error();
      const payload = await response.json();
      const matches = payload.fixtures.map((fixture: Omit<Fixture, 'homeCode' | 'awayCode'>) => ({ ...fixture, homeCode: fixture.home.slice(0, 3).toUpperCase(), awayCode: fixture.away.slice(0, 3).toUpperCase() }));
      setFixturesByDay((current) => ({ ...current, [offset]: matches }));
    } catch { setFailed(true); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (!fixturesByDay[day]) void loadFixtures(day); }, [day, fixturesByDay, loadFixtures]);
  useEffect(() => { if (day !== 0) return; const timer = window.setInterval(() => void loadFixtures(0), 60000); return () => window.clearInterval(timer); }, [day, loadFixtures]);

  const fixtures = fixturesByDay[day] ?? [];
  const visible = useMemo(() => fixtures.filter((match) => competition === 'All' || match.competition === competition), [fixtures, competition]);
  const topPick = visible.reduce<Fixture | undefined>((best, match) => !best || match.heat > best.heat ? match : best, undefined);
  const selectedLabel = day === 0 ? 'Today’s games' : day === 1 ? 'Tomorrow’s games' : `${new Intl.DateTimeFormat('en-GB', { weekday: 'long' }).format(dateAt(day))}’s games`;

  return (
    <main className="app">
      <header className="site-header"><a className="brand" href="https://mincho.dev"><span className="brand-mark">M</span><span>mincho.dev / matchday</span></a><div className="live-pill"><span /> {loading ? 'Checking scores…' : 'Scores refresh every minute'}</div></header>
      <section className="page-shell">
        <div className="intro-row"><div><p className="eyebrow">YOUR FOOTBALL GAMEWEEK</p><h1>What’s worth<br />watching?</h1></div><p className="intro-copy">Seven days of the best games across Europe, with scores and Sofia kickoff times.</p></div>

        <div className="controls"><div className="day-switch week-strip">{days.map((offset) => <button key={offset} onClick={() => setDay(offset)} className={day === offset ? 'active' : ''}><span>{dayName(offset)}</span><small>{dayDate(offset)}</small></button>)}</div><button className="refresh" onClick={() => void loadFixtures(day)}><RefreshCw size={17} className={loading ? 'spin' : ''} /> {loading ? 'Checking' : 'Refresh'}</button></div>
        <nav className="competition-tabs" aria-label="Competitions">{competitions.map((item) => <button key={item} onClick={() => setCompetition(item)} className={competition === item ? 'active' : ''}>{item}</button>)}</nav>

        {topPick && <article className="spotlight"><div className="spotlight-label"><Flame size={15} fill="currentColor" /> TOP PICK · {topPick.heat}% MATCH HEAT</div><div className="spotlight-main"><div className="team"><span className="crest cream">{topPick.homeCode}</span><strong>{topPick.home}</strong></div><div className="kickoff"><small>{topPick.competition}</small><b>{hasScore(topPick) ? `${topPick.homeScore}–${topPick.awayScore}` : topPick.time}</b><span>{hasScore(topPick) ? topPick.status : <><Clock3 size={13} /> Sofia time</>}</span></div><div className="team"><span className="crest red">{topPick.awayCode}</span><strong>{topPick.away}</strong></div></div><footer><span>{topPick.note}</span><span>{topPick.venue} <ChevronRight size={15} /></span></footer></article>}

        <div className="section-heading"><div><p className="eyebrow">FULL SLATE</p><h2>{selectedLabel}</h2></div><span>{visible.length} matches selected</span></div>
        <section className="fixture-list" aria-live="polite">
          {visible.map((match) => <article className="fixture" key={match.id}><div className={hasScore(match) ? 'score-cell' : ''}>{hasScore(match) ? <><b>{match.homeScore}–{match.awayScore}</b><small>{match.status}</small></> : <time>{match.time}</time>}</div><div className="fixture-teams"><span><i className="mini-crest">{match.homeCode[0]}</i>{match.home}</span><span><i className="mini-crest away">{match.awayCode[0]}</i>{match.away}</span></div><div className="fixture-meta"><span>{match.competition}</span><small>{match.note}</small></div><div className="heat"><Flame size={14} /> {match.heat}</div><button aria-label={`View ${match.home} versus ${match.away}`}><ChevronRight size={20} /></button></article>)}
          {!loading && !visible.length && <div className="empty"><CalendarDays size={28} /><strong>{failed ? 'Couldn’t update this day' : 'No games in this competition'}</strong><span>{failed ? 'Use Refresh to try again.' : 'Try another league or day.'}</span></div>}
        </section>
        <p className="data-note">TheSportsDB free data · Scores may be delayed · Europe/Sofia time</p>
      </section>
    </main>
  );
}
