# Matchday

A compact European football guide covering the previous seven days, today and
the next seven days for:

- UEFA Champions League
- UEFA Europa League
- Premier League
- Serie A
- La Liga

Kickoff times are presented in `Europe/Sofia`. Scores and fixtures primarily come
from football-data.org, with TheSportsDB retained as a Europa League fallback, and
are committed as a static archive. The scheduled GitHub
Action refreshes the archive every day at 05:15 UTC; it can also be run manually
from the Actions tab.

## Local development

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
```

The React interface lives in `src/`, the generated archive is
`public/data/fixtures.json`, and `scripts/update-fixtures.mjs` maintains it.
