# Kenyon Class Schedule Planner

An anonymous, static planner for exploring Fall 2026 Kenyon course sections in a weekly calendar. It is a planning tool only: it does not register students, change enrollment, enforce eligibility, create accounts, save schedules, or fetch live course data in the browser.

## Static architecture

Course data is imported from official Kenyon sources and committed as a fixed snapshot. The Next.js App Router application builds that snapshot into static HTML, CSS, and JavaScript in `out/`; no runtime server or database is part of the product.

The source material for the import workflow is the [Fall 2026 schedule by department](https://registrar.kenyon.edu/sep26_dept.htm), the [2026–27 course catalog](https://www.kenyon.edu/offices-and-services/registrar/kenyon-college-course-catalog/), and its [course offerings index](https://www.kenyon.edu/offices-and-services/registrar/kenyon-college-course-catalog/course-offerings/). Imported snapshots retain their source attribution and retrieval details.

## Development

Use a supported Node.js release: 20.19+, 22.13+, or 24+, with npm.

```bash
npm install
npm run dev
```

## Data workflow

The data commands drive the checked-in Fall 2026 import pipeline:

```bash
npm run data:import
npm run data:verify
```

Importing is a server-side action, never a browser action. Production builds validate and consume committed data; they do not contact Kenyon sources.

### Scheduled imports

`.github/workflows/daily-course-import.yml` runs the importer every day at 12:00 UTC — 08:00 America/New_York during EDT, 07:00 during EST, since GitHub cron has no DST awareness. When the scrape yields changed data, the workflow runs a full build and commits the refreshed artifacts to `main`, which Vercel deploys to production. **These commits are not reviewed by a human**, so the importer's validators and the build are the only gate; nothing in that workflow may weaken them.

An unchanged scrape writes nothing and produces no commit or deploy: the importer fingerprints the section data (excluding timestamps) and returns early when it matches the committed snapshot. `importedAt` therefore records when the data last *changed*, not when the job last ran.

Trigger a run by hand from the Actions tab via **Run workflow** — the schedule is best-effort, and GitHub delays or drops scheduled runs under load.

The CLI exits `0` when data changed, `3` when it was unchanged, and `1` on failure. It narrates on stderr and writes a JSON summary to stdout:

```bash
npx tsx scripts/courses/import-fall-2026.ts > summary.json
```

### Completeness tolerance

The importer measures each scrape against the reviewed 629-section Fall 2026 baseline. Drops within tolerance — the greater of 15 sections or 2% — are accepted as ordinary cancellations and recorded as a delta in the import report. Larger drops hard-fail, since they suggest a truncated response or a source format change rather than mass cancellation.

To move the baseline deliberately, run an inspection import with `KENYON_FALL_2026_MINIMUM_SECTIONS=<reviewed-count> npm run data:import` and update the reviewed baseline in code before accepting the new artifacts.

### Source fetching

Requests to Kenyon carry an identifying User-Agent, retry timeouts, connection errors, 429, and 5xx across three attempts with exponential backoff, and are capped at four in flight. Other 4xx responses fail immediately — a 404 is a real structural signal, not something to retry past.

The registrar serves the schedule as `text/html` with no charset declaration and Windows-1252 bytes, so the importer decodes by detected charset rather than assuming UTF-8. Assuming UTF-8 corrupts accented instructor names.

Firecrawl was evaluated as a fetch layer and rejected: the page is fully static, needs no JS rendering, and the per-run page volume would be prohibitive. It remains a documented fallback should Kenyon begin blocking GitHub Actions IP ranges — see `docs/plans/2026-08-06-001-feat-scheduled-course-scraper-plan.md`.

## Verification

```bash
npm run data:verify
npm run typecheck
npm run lint
npm run test
npm run test:e2e
npm run build
```

`npm run build` first validates the committed artifacts without network access, then writes the static deployment artifact to `out/`. Playwright starts its own verified server by default; set `PLAYWRIGHT_REUSE_EXISTING_SERVER=1` only when intentionally testing an already-running local build.

## Deployment

Vercel deploys from `main`. A push to `main` — whether from a person or from the daily import workflow — ships to production.
