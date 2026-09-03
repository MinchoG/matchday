'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronRight, Clock3, Flame, RefreshCw } from 'lucide-react';

type Day = 'today' | 'tomorrow';
type Competition = 'All' | 'Champions League' | 'Europa League' | 'Premier League' | 'Serie A' | 'La Liga';

const competitions: Competition[] = ['All', 'Champions League', 'Europa League', 'Premier League', 'Serie A', 'La Liga'];
const previewFixtures = [
  { day: 'today', time: '19:45', competition: 'Champions League', home: 'Inter', away: 'Liverpool', homeCode: 'INT', awayCode: 'LIV', venue: 'San Siro', heat: 96, note: 'European heavyweight tie' },
  { day: 'today', time: '22:00', competition: 'La Liga', home: 'Real Sociedad', away: 'Villarreal', homeCode: 'RSO', awayCode: 'VIL', venue: 'Reale Arena', heat: 82, note: 'Two attacking sides' },
  { day: 'today', time: '21:45', competition: 'Serie A', home: 'Roma', away: 'Atalanta', homeCode: 'ROM', awayCode: 'ATA', venue: 'Stadio Olimpico', heat: 88, note: 'Champions League chase' },
  { day: 'tomorrow', time: '22:00', competition: 'Europa League', home: 'Real Betis', away: 'Feyenoord', homeCode: 'BET', awayCode: 'FEY', venue: 'La Cartuja', heat: 89, note: 'Knockout football' },
  { day: 'tomorrow', time: '19:30', competition: 'Premier League', home: 'Brighton', away: 'Tottenham', homeCode: 'BHA', awayCode: 'TOT', venue: 'Amex Stadium', heat: 91, note: 'Goals usually follow' },
  { day: 'tomorrow', time: '21:45', competition: 'Serie A', home: 'Bologna', away: 'Napoli', homeCode: 'BOL', awayCode: 'NAP', venue: "Renato Dall'Ara", heat: 84, note: 'A tactical test' },
] as const;

type Fixture = { id?: string; day: Day; time: string; competition: string; home: string; away: string; homeCode: string; awayCode: string; venue: string; heat: number; note: string };

function dateKey(offset: number) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Sofia', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(Date.now() + offset * 86400000));
  return `${parts.find((p) => p.type === 'year')?.value}-${parts.find((p) => p.type === 'month')?.value}-${parts.find((p) => p.type === 'day')?.value}`;
}

function formatDate(offset: number) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).format(date);
}

export default function Home() {
  const [day, setDay] = useState<Day>('today');
  const [competition, setCompetition] = useState<Competition>('All');
  const [refreshed, setRefreshed] = useState(false);
  const [fixtures, setFixtures] = useState<Fixture[]>(previewFixtures.map((fixture) => ({ ...fixture })));
  const [feed, setFeed] = useState<'loading' | 'live' | 'preview'>('loading');
  const loadFixtures = useCallback(async () => {
    setRefreshed(true);
    try {
      const responses = await Promise.all([0, 1].map((offset) => fetch(`/api/fixtures?date=${dateKey(offset)}`).then((result) => result.ok ? result.json() : Promise.reject())));
      const live = responses.flatMap((payload, offset) => payload.fixtures.map((fixture: Omit<Fixture, 'day' | 'homeCode' | 'awayCode'>) => ({ ...fixture, day: offset === 0 ? 'today' : 'tomorrow', homeCode: fixture.home.slice(0, 3).toUpperCase(), awayCode: fixture.away.slice(0, 3).toUpperCase() })));
      setFixtures(live);
      setFeed('live');
    } catch { setFeed('preview'); }
    finally { window.setTimeout(() => setRefreshed(false), 600); }
  }, []);
  useEffect(() => { void loadFixtures(); }, [loadFixtures]);
  const visible = useMemo(() => fixtures.filter((match) => match.day === day && (competition === 'All' || match.competition === competition)), [fixtures, day, competition]);
  const topPick = visible[0];

  return (
    <main className="min-h-screen">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Matchday home"><span className="brand-mark">M</span><span>MATCHDAY</span></a>
        <div className="live-pill"><span /> {feed === 'loading' ? 'Checking fixtures…' : feed === 'live' ? 'Live schedule · updates daily' : 'Preview schedule'}</div>
      </header>
      <section id="top" className="page-shell">
        <div className="intro-row">
          <div><p className="eyebrow">YOUR FOOTBALL SHORTLIST</p><h1>What’s worth<br />watching?</h1></div>
          <p className="intro-copy">The best games across Europe, cut down to the ones you’ll actually want to watch.</p>
        </div>
        <div className="controls" aria-label="Fixture filters">
          <div className="day-switch">
            {(['today', 'tomorrow'] as Day[]).map((item, index) => (
              <button key={item} onClick={() => setDay(item)} className={day === item ? 'active' : ''}><span>{item}</span><small>{formatDate(index)}</small></button>
            ))}
          </div>
          <button className="refresh" onClick={() => void loadFixtures()} aria-label="Refresh fixtures"><RefreshCw size={17} className={refreshed ? 'spin' : ''} /> {refreshed ? 'Checking' : 'Refresh'}</button>
        </div>
        <nav className="competition-tabs" aria-label="Competitions">
          {competitions.map((item) => <button key={item} onClick={() => setCompetition(item)} className={competition === item ? 'active' : ''}>{item}</button>)}
        </nav>
        {topPick && (
          <article className="spotlight">
            <div className="spotlight-label"><Flame size={15} fill="currentColor" /> TOP PICK · {topPick.heat}% MATCH HEAT</div>
            <div className="spotlight-main">
              <div className="team"><span className="crest cream">{topPick.homeCode}</span><strong>{topPick.home}</strong></div>
              <div className="kickoff"><small>{topPick.competition}</small><b>{topPick.time}</b><span><Clock3 size={13} /> Sofia time</span></div>
              <div className="team"><span className="crest red">{topPick.awayCode}</span><strong>{topPick.away}</strong></div>
            </div>
            <footer><span>{topPick.note}</span><span>{topPick.venue} <ChevronRight size={15} /></span></footer>
          </article>
        )}
        <div className="section-heading"><div><p className="eyebrow">FULL SLATE</p><h2>{day === 'today' ? 'Today’s games' : 'Tomorrow’s games'}</h2></div><span>{visible.length} matches selected</span></div>
        <section className="fixture-list" aria-live="polite">
          {visible.map((match) => (
            <article className="fixture" key={`${match.home}-${match.away}`}>
              <time>{match.time}</time>
              <div className="fixture-teams"><span><i className="mini-crest">{match.homeCode.slice(0, 1)}</i>{match.home}</span><span><i className="mini-crest away">{match.awayCode.slice(0, 1)}</i>{match.away}</span></div>
              <div className="fixture-meta"><span>{match.competition}</span><small>{match.note}</small></div>
              <div className="heat"><Flame size={14} /> {match.heat}</div>
              <button aria-label={`View ${match.home} versus ${match.away}`}><ChevronRight size={20} /></button>
            </article>
          ))}
          {!visible.length && <div className="empty"><CalendarDays size={28} /><strong>No games in this competition</strong><span>Try another league or switch the day.</span></div>}
        </section>
        <p className="data-note">{feed === 'live' ? 'Live schedule from TheSportsDB' : 'Preview fixture data'} · Times shown in Europe/Sofia</p>
      </section>
    </main>
  );
}
