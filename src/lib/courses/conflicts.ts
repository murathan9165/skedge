import type { ScheduleEvent } from "./schedule";

export interface ConflictMarkedEvent extends ScheduleEvent {
  hasConflict: boolean;
  conflictingEventIds: string[];
}

export function markScheduleConflicts(
  events: ScheduleEvent[],
): ConflictMarkedEvent[] {
  const conflicts = new Map(
    events.map((event) => [event.id, new Set<string>()]),
  );

  for (let leftIndex = 0; leftIndex < events.length; leftIndex += 1) {
    const left = events[leftIndex];

    for (let rightIndex = leftIndex + 1; rightIndex < events.length; rightIndex += 1) {
      const right = events[rightIndex];
      const overlaps =
        left.day === right.day &&
        left.startMinutes < right.endMinutes &&
        right.startMinutes < left.endMinutes;

      if (overlaps) {
        conflicts.get(left.id)?.add(right.id);
        conflicts.get(right.id)?.add(left.id);
      }
    }
  }

  return events.map((event) => {
    const conflictingEventIds = [...(conflicts.get(event.id) ?? [])];

    return {
      ...event,
      hasConflict: conflictingEventIds.length > 0,
      conflictingEventIds,
    };
  });
}
