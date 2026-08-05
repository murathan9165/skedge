import { describe, expect, it } from "vitest";

import snapshot from "@/data/fall-2026.json";
import { plannerReducer } from "@/lib/courses/planner-state";
import {
  CALENDAR_PIXELS_PER_MINUTE,
  deriveCalendarBounds,
  getCalendarHeight,
  getEventGeometry,
  projectScheduleEvents,
} from "@/lib/courses/schedule";
import type { CourseSection, CourseSnapshot } from "@/lib/courses/types";

const section: CourseSection = {
  crn: "80565",
  subject: "AMST",
  catalogNumber: "140",
  sectionNumber: "00",
  courseCode: "AMST 140",
  title: "Prisons, Policing, & Amer Cult",
  credits: 4,
  instructors: ["Dr. Staff"],
  meetingStatus: "scheduled",
  meetings: [
    { days: ["W", "F"], startTime: "08:40", endTime: "10:00", room: "CHL300" },
    { days: ["M"], startTime: "13:10", endTime: "14:30", room: "HSA220" },
  ],
  prerequisite: { status: "none", text: "No prerequisite.", sourceUrl: "https://example.edu" },
};

describe("projectScheduleEvents", () => {
  it("expands every selected meeting pattern into official weekday events", () => {
    expect(projectScheduleEvents([section], ["80565"])).toEqual([
      {
        id: "80565-0-W",
        crn: "80565",
        courseCode: "AMST 140",
        sectionNumber: "00",
        title: "Prisons, Policing, & Amer Cult",
        day: "W",
        startTime: "08:40",
        endTime: "10:00",
        startMinutes: 520,
        endMinutes: 600,
        room: "CHL300",
      },
      {
        id: "80565-0-F",
        crn: "80565",
        courseCode: "AMST 140",
        sectionNumber: "00",
        title: "Prisons, Policing, & Amer Cult",
        day: "F",
        startTime: "08:40",
        endTime: "10:00",
        startMinutes: 520,
        endMinutes: 600,
        room: "CHL300",
      },
      {
        id: "80565-1-M",
        crn: "80565",
        courseCode: "AMST 140",
        sectionNumber: "00",
        title: "Prisons, Policing, & Amer Cult",
        day: "M",
        startTime: "13:10",
        endTime: "14:30",
        startMinutes: 790,
        endMinutes: 870,
        room: "HSA220",
      },
    ]);
  });

  it("derives removal of every meeting from the selected CRNs", () => {
    const removed = plannerReducer({ selectedCrns: ["80565"] }, { type: "remove", crn: "80565" });

    expect(projectScheduleEvents([section], removed.selectedCrns)).toEqual([]);
  });
});

describe("calendar geometry", () => {
  it("derives stable padded whole-hour bounds from the complete Fall 2026 snapshot", () => {
    const bounds = deriveCalendarBounds((snapshot as CourseSnapshot).sections);

    expect(bounds).toEqual({ startMinutes: 480, endMinutes: 1380 });
    expect(getCalendarHeight(bounds)).toBe(900);
  });

  it("uses one shared minute scale for event offsets and durations", () => {
    const bounds = { startMinutes: 480, endMinutes: 1380 };
    const earlyLongEvent = {
      ...projectScheduleEvents([section], ["80565"])[0],
      startMinutes: 490,
      endMinutes: 660,
    };

    expect(CALENDAR_PIXELS_PER_MINUTE).toBe(1);
    expect(getEventGeometry(earlyLongEvent, bounds)).toEqual({ top: 10, height: 170 });
  });
});
