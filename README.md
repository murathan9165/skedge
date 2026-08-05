# Kenyon Class Schedule Planner

An anonymous, static planner for exploring Fall 2026 Kenyon course sections in a weekly calendar. It is a planning tool only: it does not register students, change enrollment, enforce eligibility, create accounts, save schedules, or fetch live course data in the browser.

## Static architecture

Course data is imported from official Kenyon sources before release, reviewed, and committed as a fixed snapshot. The Next.js App Router application builds that snapshot into static HTML, CSS, and JavaScript in `out/`; no runtime server or database is part of the product.

The source material for the import workflow is the [Fall 2026 schedule by department](https://registrar.kenyon.edu/sep26_dept.htm), the [2026–27 course catalog](https://www.kenyon.edu/offices-and-services/registrar/kenyon-college-course-catalog/), and its [course offerings index](https://www.kenyon.edu/offices-and-services/registrar/kenyon-college-course-catalog/course-offerings/). Imported snapshots retain their source attribution and retrieval details.

## Development

Use a supported Node.js release: 20.19+, 22.13+, or 24+, with npm.

```bash
npm install
npm run dev
```

## Data workflow

The data commands are reserved for the checked-in Fall 2026 import pipeline:

```bash
npm run data:import
npm run data:verify
```

Importing is a maintainer action, not a browser action. Review the generated import report before committing a refreshed snapshot. Production builds validate and consume committed data; they do not contact Kenyon sources.

The importer rejects a schedule below the reviewed 629-section Fall 2026 baseline. If an official source change intentionally lowers that count, a maintainer can run an inspection import with `KENYON_FALL_2026_MINIMUM_SECTIONS=<reviewed-count> npm run data:import`; update the reviewed baseline in code before accepting and building the new artifacts.

## Verification

```bash
npm run data:verify
npm run typecheck
npm run lint
npm run test
npm run test:e2e
npm run build
```

`npm run build` first validates the committed artifacts without network access, then writes the static deployment artifact to `out/`. Playwright starts its own verified server by default; set `PLAYWRIGHT_REUSE_EXISTING_SERVER=1` only when intentionally testing an already-running local build. A deployment host has intentionally not been selected.
