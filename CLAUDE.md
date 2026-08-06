# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A static, anonymous planner for exploring Fall 2026 Kenyon course sections in a weekly calendar (Next.js App Router, `output: "export"`). It is planning-only: no accounts, no saved schedules, no live data fetched in the browser, no enrollment/registration actions. Everything the browser sees is a committed JSON snapshot built at deploy time. Vercel deploys from `main`.

## Commands

```bash
npm run dev              # dev server
npm run build             # prebuild runs data:verify, then next build (static export to out/)
npm run serve             # serve out/ on :3000 (used by Playwright's webServer)

npm run typecheck         # tsc --noEmit
npm run lint               # eslint .
npm run test               # vitest run (single run)
npm run test:watch         # vitest watch mode
npm run test:e2e           # playwright test (builds + serves out/ first)

npm run data:import        # refresh src/data/fall-2026.json + import report from Kenyon sources
npm run data:verify         # re-validate committed snapshot/report, no network access
```

Run a single test file: `npx vitest run tests/lib/conflicts.test.ts` or `npx playwright test e2e/planner.spec.ts`.

Full verification sequence (mirrors what should pass before committing): `data:verify` → `typecheck` → `lint` → `test` → `test:e2e` → `build`.

## Architecture

### Static data pipeline (source of truth: `src/data/fall-2026.json`)

The app never fetches course data at runtime. Instead:

1. `scripts/courses/import-fall-2026.ts` fetches the Kenyon Fall 2026 schedule page and course catalog pages (network access restricted to two approved hostnames — `assertApprovedSourceUrl` enforces this on every attempt and every redirect hop), parses them via `parse-schedule.ts` and `parse-catalog.ts`, joins each schedule section to its catalog prerequisite text, and atomically writes `src/data/fall-2026.json` (the snapshot) and `src/data/fall-2026.import-report.json` (provenance + counts) using a temp-dir-then-rename swap with rollback on failure.
2. Fetching is hardened for unattended runs: identifying User-Agent, three attempts with exponential backoff on timeouts/connection errors/429/5xx (other 4xx fail immediately by design), and a shared limiter capping requests at four in flight. `decodeSourceBytes` decodes by detected charset — the registrar serves Windows-1252 with no charset declaration, so assuming UTF-8 corrupts accented instructor names.
3. `assertFall2026ScheduleCompleteness` measures the scrape against `FALL_2026_REVIEWED_MINIMUM_SECTION_COUNT` (629) and accepts drops within `sectionCountTolerance` — the greater of 15 sections or 2% — recording the delta in the report's `completeness` block. Larger drops hard-fail. `KENYON_FALL_2026_MINIMUM_SECTIONS=<n>` overrides the baseline for deliberate maintenance.
4. `hashSections` fingerprints the section array (canonicalized, timestamps excluded) against the committed snapshot. An unchanged scrape returns `outcome: "unchanged"` and writes nothing, so `importedAt` means "when data last changed", not "when the job last ran".
5. `scripts/courses/verify-fall-2026.ts` re-validates the committed snapshot/report with zero network access — this is what `npm run build`'s `prebuild` hook runs, so a stale or hand-edited snapshot fails the build before Next.js even starts.
6. `validateCourseSnapshot` / `validateImportReport` (both exported from `import-fall-2026.ts`) are the single schema authority used by both the importer and the verifier — cross-check counts (row classification totals, prerequisite status counts, catalog page URLs, completeness delta) between the snapshot and its report.

The CLI exits `0` (changed), `3` (unchanged), or `1` (failed), narrating on stderr and writing a JSON summary to stdout — see `buildRunSummary`.

### Scheduled imports

`.github/workflows/daily-course-import.yml` runs the importer daily at 12:00 UTC and commits changed artifacts directly to `main`, which Vercel deploys. **Those commits are unreviewed**, so the importer's validators plus `npm run build` are the only gate — never add `continue-on-error` to that workflow or bypass the build step. The workflow also refreshes `.github/last-successful-import` every 45 quiet days, because GitHub disables scheduled workflows after 60 days without repository activity.

### Client architecture (`src/lib/courses` + `src/components/planner`)

- `types.ts` — the shared data model: `CourseSection`, `MeetingInterval`, `Prerequisite` (a tagged union: `known` / `none` / `unavailable`, each carrying a source URL when applicable), `CourseSnapshot`, `ImportReport`.
- `schedule.ts` — turns selected `CourseSection`s into calendar-positioned `ScheduleEvent`s (one event per meeting day/interval).
- `conflicts.ts` — pairwise overlap detection over `ScheduleEvent[]`, annotating each with `hasConflict` / `conflictingEventIds`.
- `search.ts` — filtering/search over the full section list for the course search drawer.
- `planner-state.ts` — a plain reducer (`add` / `remove` / `reset` over `selectedCrns`) with no persistence; refreshing the page clears the plan by design (no accounts/saved state, per the product constraint above).
- `planner-shell.tsx` — the top-level client component. Owns planner state, wires `@dnd-kit/react` drag-and-drop from the search drawer onto the weekly calendar, and manages the search drawer as a `<dialog>` that behaves as a true modal below `52rem` viewport width (via `useSyncExternalStore` on a `matchMedia` query) and as a non-modal panel above it — including manual focus-trap and backdrop-dismiss handling for the modal case.
- `weekly-calendar.tsx`, `course-card.tsx`, `course-search-drawer.tsx`, `prerequisite-popover.tsx` — presentation components consuming the above.

### Testing layout

- `tests/lib/*` and `tests/components/*` (Vitest + Testing Library, jsdom) mirror `src/lib` and `src/components`.
- `tests/scripts/*` covers the import/parse/verify pipeline, using fixture HTML in `tests/fixtures/kenyon/`.
- `e2e/planner.spec.ts` (Playwright, chromium only) drives the built static app; its `webServer` runs `npm run build && npm run serve`, so e2e always exercises a real static export, not the dev server.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
