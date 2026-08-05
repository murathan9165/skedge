"use client";

import { useDroppable } from "@dnd-kit/react";
import { useRef } from "react";
import snapshot from "@/data/fall-2026.json";
import {
  markScheduleConflicts,
  type ConflictMarkedEvent,
} from "@/lib/courses/conflicts";
import {
  CALENDAR_PIXELS_PER_MINUTE,
  deriveCalendarBounds,
  getCalendarHeight,
  getEventGeometry,
  projectScheduleEvents,
} from "@/lib/courses/schedule";
import type { CourseSection, MeetingDay } from "@/lib/courses/types";

interface WeeklyCalendarProps {
  sections: CourseSection[];
  onRemove: (crn: string) => void;
  onReset: () => void;
}

export const WEEKLY_CALENDAR_DROP_ID = "weekly-calendar";

const weekdays: Array<{ day: MeetingDay; label: string }> = [
  { day: "M", label: "Monday" },
  { day: "T", label: "Tuesday" },
  { day: "W", label: "Wednesday" },
  { day: "R", label: "Thursday" },
  { day: "F", label: "Friday" },
];

const calendarBounds = deriveCalendarBounds(
  snapshot.sections as unknown as CourseSection[],
);

function formatTime(time: string): string {
  const [hour, minute] = time.split(":").map(Number);
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;

  return `${displayHour}:${minute.toString().padStart(2, "0")} ${suffix}`;
}

function formatMinutes(minutes: number): string {
  const hour = Math.floor(minutes / 60);

  return formatTime(`${hour.toString().padStart(2, "0")}:00`);
}

function getDayEventLayouts(events: ReturnType<typeof markScheduleConflicts>) {
  const layouts = new Map<string, { left: string; width: string }>();
  const eventsById = new Map(events.map((event) => [event.id, event]));
  const visited = new Set<string>();

  for (const event of events) {
    if (visited.has(event.id)) continue;

    const group: ConflictMarkedEvent[] = [];
    const pending = [event.id];

    while (pending.length) {
      const id = pending.pop();
      if (!id || visited.has(id)) continue;
      const member = eventsById.get(id);
      if (!member) continue;

      visited.add(id);
      group.push(member);
      pending.push(...member.conflictingEventIds);
    }

    const sortedGroup = group.toSorted(
      (left, right) =>
        left.startMinutes - right.startMinutes ||
        left.endMinutes - right.endMinutes ||
        left.id.localeCompare(right.id),
    );
    const laneEnds: number[] = [];
    const lanes = new Map<string, number>();

    for (const member of sortedGroup) {
      let lane = laneEnds.findIndex((endMinutes) => endMinutes <= member.startMinutes);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = member.endMinutes;
      lanes.set(member.id, lane);
    }

    const laneCount = Math.max(1, laneEnds.length);
    for (const member of group) {
      const lane = lanes.get(member.id) ?? 0;
      layouts.set(member.id, {
        left: `${(lane / laneCount) * 100}%`,
        width: `${100 / laneCount}%`,
      });
    }
  }

  return layouts;
}

export function WeeklyCalendar({ sections, onRemove, onReset }: WeeklyCalendarProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { ref: dropTargetRef, isDropTarget } = useDroppable({
    id: WEEKLY_CALENDAR_DROP_ID,
    accept: "course-section",
  });
  const events = markScheduleConflicts(
    projectScheduleEvents(
      sections,
      sections.map((section) => section.crn),
    ),
  );
  const eventsById = new Map(events.map((event) => [event.id, event]));
  const eventLayouts = new Map(
    weekdays.flatMap(({ day }) =>
      Array.from(
        getDayEventLayouts(events.filter((event) => event.day === day)).entries(),
      ),
    ),
  );
  const calendarHeight = getCalendarHeight(calendarBounds);
  const hourMarkers = Array.from(
    { length: (calendarBounds.endMinutes - calendarBounds.startMinutes) / 60 },
    (_, index) => calendarBounds.startMinutes + index * 60,
  );

  return (
    <section
      ref={dropTargetRef}
      className={`weekly-calendar${isDropTarget ? " weekly-calendar--drop-target" : ""}`}
      aria-labelledby="weekly-calendar-heading"
    >
      <div className="weekly-calendar__heading">
        <div>
          <h2 ref={headingRef} id="weekly-calendar-heading" tabIndex={-1}>Weekly schedule</h2>
        </div>
        <div className="weekly-calendar__controls">
          <p>{sections.length} {sections.length === 1 ? "section" : "sections"} added</p>
          <button
            type="button"
            disabled={sections.length === 0}
            aria-label="Reset week"
            onClick={() => {
              onReset();
              headingRef.current?.focus();
            }}
          >
            Reset
          </button>
        </div>
      </div>
      <p className="visually-hidden" role="status" aria-live="polite">
        {isDropTarget ? "Release to add this section at its official meeting times." : ""}
      </p>
      <div
        className="weekly-calendar__scroll"
        tabIndex={0}
        aria-label="Scrollable weekly schedule"
      >
        <div className="weekly-calendar__weekday-headings" aria-hidden="true">
          {weekdays.map(({ day, label }) => (
            <span key={day}>{label}</span>
          ))}
        </div>
        <div
          className="weekly-calendar__grid"
          role="grid"
          aria-label="Monday through Friday class schedule"
          style={{ height: calendarHeight }}
        >
        <div
          className="weekly-calendar__time-axis"
          aria-hidden="true"
          style={{ position: "relative", height: calendarHeight }}
        >
          {hourMarkers.map((minutes) => (
            <time
              key={minutes}
              className="weekly-calendar__time-label"
              style={{
                position: "absolute",
                top: getEventGeometry(
                  { startMinutes: minutes, endMinutes: minutes },
                  calendarBounds,
                ).top + 30 * CALENDAR_PIXELS_PER_MINUTE,
              }}
            >
              {formatMinutes(minutes)}
            </time>
          ))}
        </div>
        {weekdays.map(({ day, label }) => (
          <div
            key={day}
            className="weekly-calendar__day"
            role="row"
            aria-label={label}
            data-day={day}
            style={{ position: "relative", height: calendarHeight }}
          >
            {events
              .filter((event) => event.day === day)
              .map((event) => {
                const geometry = getEventGeometry(event, calendarBounds);
                const layout = eventLayouts.get(event.id);
                const conflictingCourses = event.conflictingEventIds
                  .map((id) => eventsById.get(id)?.courseCode)
                  .filter((courseCode): courseCode is string => Boolean(courseCode));

                return (
                  <article
                    key={event.id}
                    className={`weekly-calendar__event${event.hasConflict ? " weekly-calendar__event--conflict" : ""}`}
                    aria-label={`${event.courseCode} section ${event.sectionNumber}, ${label}, ${formatTime(event.startTime)} to ${formatTime(event.endTime)}, ${event.room}`}
                    data-conflict={event.hasConflict || undefined}
                    style={{
                      position: "absolute",
                      top: geometry.top,
                      height: geometry.height,
                      left: layout?.left,
                      width: layout?.width,
                    }}
                  >
                    <strong>
                      {event.courseCode}-{event.sectionNumber} <time>{formatTime(event.startTime)}–{formatTime(event.endTime)}</time>
                    </strong>
                    <span>{event.title}</span>
                    <span>{event.room}</span>
                    {event.hasConflict ? (
                      <span
                        className="weekly-calendar__conflict-status"
                        role="status"
                        aria-label={`Conflict with ${conflictingCourses.join(", ")}`}
                      >
                        <span aria-hidden="true">⚠</span> Conflict
                      </span>
                    ) : null}
                    <button
                      type="button"
                      className="weekly-calendar__event-remove"
                      aria-label={`Remove ${event.courseCode} section ${event.sectionNumber}`}
                      onClick={(clickEvent) => {
                        onRemove(event.crn);
                        if (clickEvent.detail === 0) headingRef.current?.focus();
                      }}
                    >
                      ×
                    </button>
                  </article>
                );
              })}
          </div>
        ))}
        </div>
      </div>
    </section>
  );
}
