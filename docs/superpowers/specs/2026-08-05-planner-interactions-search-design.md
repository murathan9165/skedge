# Planner interaction and human-friendly search design

## Goal

Make the Fall 2026 planner feel direct: course cards should drag naturally, scheduled events should have a compact removal control, and students should be able to search by department names instead of memorizing subject codes.

## Behavior

### Draggable course cards

- The visible `Drag` button is removed.
- A scheduled, unselected course card is draggable from its card surface.
- The `Add` and `Prereqs` controls remain clickable controls and must not start a drag when activated.
- Untimed and already-added cards remain non-draggable.
- Dropping a card on the weekly calendar adds the course at its official meeting times.

### Calendar removal

- Each scheduled calendar event has a compact `×` control in its top-right corner.
- The control removes that course section from the planner.
- The control keeps an explicit accessible name identifying the course and section.

### Human-friendly search

- Search remains case-insensitive and matches course code, catalog number, title, and instructor.
- Each section also contributes a curated readable department alias, including `ARHS` → `Art History`, `PSYC` → `Psychology`, `HIST` → `History`, and `COMP` → `Computer Science`.
- A multi-word query is tokenized on whitespace; every token must match somewhere in the section's combined searchable text. This makes queries such as `art history` work across an alias and title.
- Empty search continues to browse all sections in the existing stable order.

## Implementation boundaries

- Keep drag/drop orchestration in the existing planner shell and `@dnd-kit/react` integration.
- Keep search normalization and department aliases in `src/lib/courses/search.ts`.
- Keep removal presentation in the weekly calendar component and its existing `onRemove` callback.
- Do not change course data, prerequisite semantics, persistence, or registration behavior.

## Verification

- Add unit/component coverage for card drag affordance, calendar `×` removal, and alias/token search.
- Preserve existing keyboard and responsive behavior.
- Run the full Vitest suite, Playwright suite, typecheck, lint, data verification, and static build.
