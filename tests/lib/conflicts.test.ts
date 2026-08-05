import { describe, expect, it } from "vitest";

import { markScheduleConflicts } from "@/lib/courses/conflicts";
import type { ScheduleEvent } from "@/lib/courses/schedule";
import type { MeetingDay } from "@/lib/courses/types";

function event(
  id: string,
  startMinutes: number,
  endMinutes: number,
  day: MeetingDay = "M",
): ScheduleEvent {
  return {
    id,
    crn: id,
    courseCode: `COURSE ${id}`,
    sectionNumber: "00",
    title: `Course ${id}`,
    day,
    startTime: "09:00",
    endTime: "10:00",
    startMinutes,
    endMinutes,
    room: "ROOM",
  };
}

describe("markScheduleConflicts", () => {
  it("does not mark intervals that only touch at an endpoint", () => {
    const marked = markScheduleConflicts([
      event("A", 540, 600),
      event("B", 600, 660),
    ]);

    expect(marked.map(({ hasConflict, conflictingEventIds }) => ({ hasConflict, conflictingEventIds }))).toEqual([
      { hasConflict: false, conflictingEventIds: [] },
      { hasConflict: false, conflictingEventIds: [] },
    ]);
  });

  it("marks both sides of a partial overlap", () => {
    const marked = markScheduleConflicts([
      event("A", 540, 620),
      event("B", 600, 660),
    ]);

    expect(marked.map(({ hasConflict, conflictingEventIds }) => ({ hasConflict, conflictingEventIds }))).toEqual([
      { hasConflict: true, conflictingEventIds: ["B"] },
      { hasConflict: true, conflictingEventIds: ["A"] },
    ]);
  });

  it("marks both the containing and contained intervals", () => {
    const marked = markScheduleConflicts([
      event("A", 540, 660),
      event("B", 570, 600),
    ]);

    expect(marked.map(({ hasConflict, conflictingEventIds }) => ({ hasConflict, conflictingEventIds }))).toEqual([
      { hasConflict: true, conflictingEventIds: ["B"] },
      { hasConflict: true, conflictingEventIds: ["A"] },
    ]);
  });

  it("marks every affected event in a three-way overlap without crossing weekdays", () => {
    const marked = markScheduleConflicts([
      event("A", 540, 610),
      event("B", 570, 650),
      event("C", 630, 700),
      event("D", 570, 650, "T"),
    ]);

    expect(marked.map(({ hasConflict, conflictingEventIds }) => ({ hasConflict, conflictingEventIds }))).toEqual([
      { hasConflict: true, conflictingEventIds: ["B"] },
      { hasConflict: true, conflictingEventIds: ["A", "C"] },
      { hasConflict: true, conflictingEventIds: ["B"] },
      { hasConflict: false, conflictingEventIds: [] },
    ]);
  });
});
