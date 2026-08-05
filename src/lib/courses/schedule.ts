import type { CourseSection, MeetingDay } from "./types";

export interface ScheduleEvent {
  id: string;
  crn: string;
  courseCode: string;
  sectionNumber: string;
  title: string;
  day: MeetingDay;
  startTime: string;
  endTime: string;
  startMinutes: number;
  endMinutes: number;
  room: string;
}

export interface CalendarBounds {
  startMinutes: number;
  endMinutes: number;
}

export interface EventGeometry {
  top: number;
  height: number;
}

export const CALENDAR_PIXELS_PER_MINUTE = 1;
export const CALENDAR_START_MINUTES = 8 * 60;

export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function projectScheduleEvents(
  sections: CourseSection[],
  selectedCrns: string[],
): ScheduleEvent[] {
  const selected = new Set(selectedCrns);

  return sections.flatMap((section) => {
    if (!selected.has(section.crn)) {
      return [];
    }

    return section.meetings.flatMap((meeting, meetingIndex) =>
      meeting.days.map((day) => ({
        id: `${section.crn}-${meetingIndex}-${day}`,
        crn: section.crn,
        courseCode: section.courseCode,
        sectionNumber: section.sectionNumber,
        title: section.title,
        day,
        startTime: meeting.startTime,
        endTime: meeting.endTime,
        startMinutes: timeToMinutes(meeting.startTime),
        endMinutes: timeToMinutes(meeting.endTime),
        room: meeting.room,
      })),
    );
  });
}

export function deriveCalendarBounds(sections: CourseSection[]): CalendarBounds {
  const meetings = sections.flatMap((section) => section.meetings);
  const latest = Math.max(...meetings.map((meeting) => timeToMinutes(meeting.endTime)));

  return {
    startMinutes: CALENDAR_START_MINUTES,
    endMinutes: Math.min(24 * 60, Math.ceil(latest / 60) * 60 + 60),
  };
}

export function getCalendarHeight(bounds: CalendarBounds): number {
  return (bounds.endMinutes - bounds.startMinutes) * CALENDAR_PIXELS_PER_MINUTE;
}

export function getEventGeometry(
  event: Pick<ScheduleEvent, "startMinutes" | "endMinutes">,
  bounds: CalendarBounds,
): EventGeometry {
  return {
    top: (event.startMinutes - bounds.startMinutes) * CALENDAR_PIXELS_PER_MINUTE,
    height: (event.endMinutes - event.startMinutes) * CALENDAR_PIXELS_PER_MINUTE,
  };
}
