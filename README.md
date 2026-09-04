# Matchday

A compact today-and-tomorrow football fixture guide for:

- UEFA Champions League
- UEFA Europa League
- Premier League
- Serie A
- La Liga

Kickoff times are presented in `Europe/Sofia`. The current implementation uses
TheSportsDB through a server-side route so the browser never depends on third-party
CORS behavior. A football-data.org token can be added later as the primary source.

## Local development

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
```

The application source lives in `app/`; the fixture adapter is
`app/api/fixtures/route.ts` and the interface is `app/page.tsx`.
