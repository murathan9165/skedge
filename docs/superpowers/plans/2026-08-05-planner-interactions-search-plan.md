# Planner Interaction and Human-Friendly Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make course cards naturally draggable, make calendar removal a compact top-right `×`, and let students search by readable department names and multi-word phrases.

**Architecture:** Preserve the existing `@dnd-kit/react` provider and planner state. Put searchable text/department aliases in `src/lib/courses/search.ts`, card drag wiring in `CourseCard`, and the calendar removal affordance in `WeeklyCalendar`; add focused tests at each existing unit/component boundary plus browser coverage for the real interactions.

**Tech Stack:** Next.js App Router, React, TypeScript, `@dnd-kit/react`, Vitest + Testing Library, Playwright, CSS modules via `src/app/globals.css`.

## Global Constraints

- The visible `Drag` button is removed.
- A scheduled, unselected course card is draggable from its card surface.
- The `Add` and `Prereqs` controls remain clickable controls and must not start a drag when activated.
- Untimed and already-added cards remain non-draggable.
- Each scheduled calendar event has a compact `×` control in its top-right corner.
- The control keeps an explicit accessible name identifying the course and section.
- Search remains case-insensitive and matches course code, catalog number, title, and instructor.
- Each section contributes curated readable aliases including `ARHS` → `Art History`, `PSYC` → `Psychology`, `HIST` → `History`, and `COMP` → `Computer Science`.
- Multi-word queries are whitespace-tokenized and every token must match the section's combined searchable text.
- Empty search continues to browse all sections in stable order.
- Do not change course data, prerequisite semantics, persistence, or registration behavior.

---

### Task 1: Add human-friendly tokenized course search

**Files:**
- Modify: `src/lib/courses/search.ts`
- Test: `tests/lib/search.test.ts`

**Interfaces:**
- Preserve `searchSections(sections: CourseSection[], query: string): CourseSection[]`.
- Add an internal subject-alias lookup used only to build searchable text; do not change `CourseSection` or the imported snapshot schema.

- [ ] **Step 1: Write the failing tests**

Add cases to `tests/lib/search.test.ts` using the existing fixture sections:

```ts
it.each([
  ["art history", ["4"]],
  ["psychology", ["5"]],
  ["computer science", ["6"]],
])("matches readable subject aliases for %s", (query, crns) => {
  expect(searchSections(aliasSections, query).map((section) => section.crn)).toEqual(crns);
});

it("requires every word in a multi-word query to match", () => {
  expect(searchSections(aliasSections, "art history").map((section) => section.crn)).toEqual(["4"]);
  expect(searchSections(aliasSections, "art physics")).toEqual([]);
});
```

Define `aliasSections` in the test with `ARHS 221`, `PSYC 100`, and `COMP 101` sections whose titles do not need to contain the full department name, proving aliases—not incidental titles—drive the result.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- tests/lib/search.test.ts`

Expected: the new alias and multi-word tests fail because the current search only checks one contiguous query against raw section fields.

- [ ] **Step 3: Implement the minimal search behavior**

In `src/lib/courses/search.ts`:

1. Add a `Record<string, string>` alias map containing all current department codes, with these exact entries at minimum: `ARHS: "Art History"`, `PSYC: "Psychology"`, `HIST: "History"`, and `COMP: "Computer Science"`.
2. Normalize searchable text with `toLocaleLowerCase()` and whitespace collapse.
3. Build one searchable string from subject, alias, catalog number, course code, title, and instructors.
4. Split a non-empty query on whitespace and return a section only when every token is included in that combined string.
5. Retain the existing stable `compareSections` sort and empty-query browse behavior.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm test -- tests/lib/search.test.ts`

Expected: all search tests pass, including the existing code/title/instructor cases and the new alias/token cases.

- [ ] **Step 5: Commit**

```bash
git add src/lib/courses/search.ts tests/lib/search.test.ts
git commit -m "feat: support readable course search aliases"
```

### Task 2: Make the course card surface draggable

**Files:**
- Modify: `src/components/planner/course-card.tsx`
- Modify: `src/app/globals.css`
- Test: `tests/components/course-card.test.tsx`

**Interfaces:**
- Preserve `CourseCardProps`, `onAdd`, `selected`, and `addDisabled` behavior.
- Continue using the existing `useDraggable` data payload `{ crn: section.crn }` and `course-${crn}` id.

- [ ] **Step 1: Write the failing tests**

Update `tests/components/course-card.test.tsx` to assert:

```ts
expect(screen.queryByRole("button", { name: /drag amst 140/i })).not.toBeInTheDocument();
expect(screen.getByRole("article")).toHaveAttribute("data-drag-enabled", "true");
```

Add a test that clicking `Add` still calls the supplied callback once and clicking `Prereqs` opens its dialog; these controls must remain ordinary controls after the card receives drag listeners.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- tests/components/course-card.test.tsx`

Expected: the old drag-button assertion fails because the current implementation still renders `Drag`.

- [ ] **Step 3: Implement the card drag surface**

In `CourseCard`:

1. Remove `dragHandleRef` and the visible `Drag` button.
2. Read `attributes` and `listeners` from `useDraggable` and spread them on the root `<article>` alongside `draggable={false}` and the existing ref.
3. Add `data-drag-enabled={isAddDisabled ? undefined : "true"}` for deterministic test and styling state.
4. Prevent action-button pointer events from bubbling into the card drag sensor by stopping propagation on the action group’s pointer-down handler, while preserving click/focus/keyboard behavior.
5. Keep the existing disabled logic for selected, untimed, add-disabled, and missing `onAdd` cards.

In `src/app/globals.css`, add a `grab` cursor for enabled cards and `grabbing` for `.course-card--dragging`; do not add a second drag affordance.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- tests/components/course-card.test.tsx tests/components/planner-shell.test.tsx`

Expected: card rendering, Add/Prereqs controls, selected/untimed disabled behavior, and planner integration all pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/planner/course-card.tsx src/app/globals.css tests/components/course-card.test.tsx
git commit -m "feat: make course cards draggable"
```

### Task 3: Replace calendar removal text with a top-right close control

**Files:**
- Modify: `src/components/planner/weekly-calendar.tsx`
- Modify: `src/app/globals.css`
- Test: `tests/components/weekly-calendar.test.tsx`

**Interfaces:**
- Preserve `WeeklyCalendarProps.onRemove(crn: string): void` and the existing event geometry/conflict rendering.

- [ ] **Step 1: Write the failing test**

Change the removal assertion in `tests/components/weekly-calendar.test.tsx` to require the compact control:

```ts
const removeButton = screen.getByRole("button", { name: "Remove AMST 140 section 00" });
expect(removeButton).toHaveTextContent("×");
expect(removeButton).toHaveClass("weekly-calendar__event-remove");
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- tests/components/weekly-calendar.test.tsx`

Expected: the test fails because the current button renders `Remove` and has no close-control class.

- [ ] **Step 3: Implement the close control**

In `WeeklyCalendar`, keep the current `aria-label` and `onClick` callback, change the visible content to `×`, and add `className="weekly-calendar__event-remove"`.

In `src/app/globals.css`, position the button at the event’s top-right with absolute positioning, a compact square hit area, and a visible focus outline. Set `.weekly-calendar__event` to `position: absolute` through its existing inline geometry plus `overflow: hidden` only if needed to keep the close button within the event; preserve readable event content and scroll behavior for long events.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- tests/components/weekly-calendar.test.tsx`

Expected: the close-control test and existing geometry/conflict/removal tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/planner/weekly-calendar.tsx src/app/globals.css tests/components/weekly-calendar.test.tsx
git commit -m "feat: use compact calendar removal controls"
```

### Task 4: Cover the revised flows in browser tests and run the full gate

**Files:**
- Modify: `e2e/planner.spec.ts`
- Modify: `tests/components/course-search-drawer.test.tsx` only if the search alias needs an integration assertion

**Interfaces:**
- Use the existing planner route and visible Fall 2026 snapshot; do not add a test-only API or fixture mutation.

- [ ] **Step 1: Write failing browser assertions**

Add Playwright coverage that:

1. Searches `psychology` and sees a PSYC result without typing `PSYC`.
2. Searches `art history` and sees an ARHS result.
3. Drags a visible course card from its body (not a drag button) onto the calendar and observes the section count increase.
4. Removes the scheduled event by clicking its `×` accessible remove button and observes the section count return to zero.

- [ ] **Step 2: Run the focused browser tests and verify RED**

Run: `npm run test:e2e -- e2e/planner.spec.ts`

Expected: at least the new interaction assertions fail against the old UI.

- [ ] **Step 3: Implement only test selectors needed for stable behavior**

Use existing accessible names and `data-section-number`/course-code text. Do not add brittle implementation selectors unless a real drag target cannot be located accessibly; if one is needed, use a semantic `data-*` attribute tied to the course CRN.

- [ ] **Step 4: Run the browser tests and verify GREEN**

Run: `npm run test:e2e -- e2e/planner.spec.ts`

Expected: all existing and new browser scenarios pass.

- [ ] **Step 5: Run the complete verification gate**

Run each command from the repository root:

```bash
npm run data:verify
npm run typecheck
npx eslint src tests scripts e2e
npm test
npm run test:e2e
npm run build
npm audit --omit=dev
```

Expected: every command exits 0; Vitest reports all files/tests passing, Playwright reports all scenarios passing, and the data/build checks remain static and network-free.

- [ ] **Step 6: Commit**

```bash
git add e2e/planner.spec.ts tests/components/course-search-drawer.test.tsx
git commit -m "test: cover planner interaction feedback"
```
