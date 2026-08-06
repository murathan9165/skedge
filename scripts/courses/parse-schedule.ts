import { load } from "cheerio";

import type {
  ImportedScheduleSection,
  MeetingDay,
  MeetingInterval,
  ScheduleRowCounts,
} from "../../src/lib/courses/types";

export interface ParsedSchedule {
  sections: ImportedScheduleSection[];
  rowCounts: ScheduleRowCounts;
}

export const FALL_2026_REVIEWED_MINIMUM_SECTION_COUNT = 629;

/**
 * Sections are genuinely cancelled between imports, so an exact floor breaks on
 * the first ordinary change. A large drop is a different animal -- far more
 * likely a truncated response or a format change than mass cancellation -- so
 * only that hard-fails.
 */
export const SECTION_COUNT_TOLERANCE_FLOOR = 15;
export const SECTION_COUNT_TOLERANCE_RATIO = 0.02;

export interface ScheduleCompleteness {
  baseline: number;
  actual: number;
  delta: number;
  tolerance: number;
}

export function sectionCountTolerance(baseline: number): number {
  return Math.max(
    SECTION_COUNT_TOLERANCE_FLOOR,
    Math.ceil(baseline * SECTION_COUNT_TOLERANCE_RATIO),
  );
}

export function assertFall2026ScheduleCompleteness(
  parsed: ParsedSchedule,
  baseline = FALL_2026_REVIEWED_MINIMUM_SECTION_COUNT,
): ScheduleCompleteness {
  if (!Number.isInteger(baseline) || baseline < 1) {
    throw new Error("Fall 2026 minimum section count must be a positive integer");
  }

  const actual = parsed.sections.length;
  const tolerance = sectionCountTolerance(baseline);
  const delta = actual - baseline;

  if (delta < -tolerance) {
    throw new Error(
      `Fall 2026 schedule contained ${actual} sections, ${-delta} below the reviewed baseline of ${baseline} and beyond the accepted tolerance of ${tolerance}`,
    );
  }

  return { baseline, actual, delta, tolerance };
}

const validDays = new Set<MeetingDay>(["M", "T", "W", "R", "F"]);

function parseInstructors(value: string): string[] {
  if (!value.includes(",")) return [value];

  const parts = value.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length % 2 !== 0) {
    throw new Error(`Malformed instructor field: ${value}`);
  }

  const instructors: string[] = [];
  for (let index = 0; index < parts.length; index += 2) {
    instructors.push(`${parts[index]}, ${parts[index + 1]}`);
  }
  return instructors;
}

function formatTime(value: string, crn: string): string {
  if (!/^\d{4}$/.test(value)) {
    throw new Error(`Invalid meeting time ${value} for CRN ${crn}`);
  }

  const hour = Number(value.slice(0, 2));
  const minute = Number(value.slice(2));
  if (hour > 23 || minute > 59) {
    throw new Error(`Invalid meeting time ${value} for CRN ${crn}`);
  }
  return `${value.slice(0, 2)}:${value.slice(2)}`;
}

function parseMeeting(
  daysValue: string,
  timeValue: string,
  room: string,
  crn: string,
): MeetingInterval | null {
  const daysText = daysValue.trim();
  const timeText = timeValue.trim();
  if (!daysText && (timeText === "" || timeText === "-")) return null;
  if (!daysText || timeText === "" || timeText === "-") {
    throw new Error(`Incomplete meeting interval for CRN ${crn}`);
  }

  const days = [...daysText].map((day) => {
    if (!validDays.has(day as MeetingDay)) {
      throw new Error(`Invalid day code ${day} for CRN ${crn}`);
    }
    return day as MeetingDay;
  });
  const match = /^(\d{4})-(\d{4})$/.exec(timeText);
  if (!match) throw new Error(`Invalid meeting time ${timeText} for CRN ${crn}`);

  const startTime = formatTime(match[1], crn);
  const endTime = formatTime(match[2], crn);
  if (match[2] <= match[1]) {
    throw new Error(`Meeting must end after it starts for CRN ${crn}`);
  }

  return { days, startTime, endTime, room: room.trim() };
}

function parseOptionalInteger(value: string): number | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : Number(trimmed);
}

function parseSection(line: string): ImportedScheduleSection {
  const crn = line.slice(0, 5);
  const subject = line.slice(6, 10).trim();
  const numberAndSection = line.slice(11, 18).trim();
  const [catalogNumber, sectionNumber] = numberAndSection.split(".");
  if (!subject || !catalogNumber || !sectionNumber) {
    throw new Error(`Malformed schedule row for CRN ${crn}`);
  }

  const meetings = [
    parseMeeting(line.slice(109, 116), line.slice(116, 126), line.slice(126, 137), crn),
    parseMeeting(line.slice(137, 144), line.slice(144, 154), line.slice(154, 165), crn),
  ].filter((meeting): meeting is MeetingInterval => meeting !== null);

  return {
    crn,
    subject,
    catalogNumber,
    sectionNumber,
    courseCode: `${subject} ${catalogNumber}`,
    title: line.slice(19, 62).trim(),
    credits: Number(line.slice(73, 78).trim()),
    permission: line.slice(165, 168).trim() || null,
    seatLimit: parseOptionalInteger(line.slice(168, 173)),
    seatsEnrolled: parseOptionalInteger(line.slice(173, 177)),
    instructors: parseInstructors(line.slice(183).trim()),
    meetingStatus: meetings.length > 0 ? "scheduled" : "time-unavailable",
    meetings,
  };
}

export function parseScheduleHtml(html: string): ParsedSchedule {
  const $ = load(html);
  const pre = $("pre").first();
  if (pre.length === 0 || !pre.text().includes("CRN   SUBJ NUM")) {
    throw new Error("Fall 2026 schedule did not contain the expected fixed-width table");
  }

  const counts: ScheduleRowCounts = {
    total: 0,
    header: 0,
    section: 0,
    continuation: 0,
    divider: 0,
    summary: 0,
  };
  const sections: ImportedScheduleSection[] = [];
  const crns = new Set<string>();

  for (const line of pre.text().split(/\r?\n/)) {
    if (!line.trim()) continue;
    counts.total += 1;

    if (line.startsWith("CRN   SUBJ") || line.startsWith("----- ----")) {
      counts.header += 1;
    } else if (/^\d{5}\s/.test(line)) {
      const section = parseSection(line);
      if (crns.has(section.crn)) throw new Error(`Duplicate CRN ${section.crn}`);
      crns.add(section.crn);
      sections.push(section);
      counts.section += 1;
    } else if (/^\s{126}\S/.test(line)) {
      const previousSection = sections.at(-1);
      const previousMeeting = previousSection?.meetings[0];
      if (!previousMeeting || line.slice(0, 126).trim()) {
        throw new Error(`Unaccounted schedule row: ${line}`);
      }
      previousMeeting.room += line.slice(126).trim();
      counts.continuation += 1;
    } else if (/^\s+\*{4}/.test(line)) {
      counts.divider += 1;
    } else if (/^\s+SUM(?:\s|$)/.test(line)) {
      counts.summary += 1;
    } else {
      throw new Error(`Unaccounted schedule row: ${line}`);
    }
  }

  if (sections.length === 0) throw new Error("Fall 2026 schedule contained no section rows");
  return { sections, rowCounts: counts };
}
