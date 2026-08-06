import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  assertFall2026ScheduleCompleteness,
  parseScheduleHtml,
  sectionCountTolerance,
  type ParsedSchedule,
} from "../../scripts/courses/parse-schedule";

const fixturePath = path.join(
  process.cwd(),
  "tests/fixtures/kenyon/fall-2026-schedule.html",
);

async function fixture(): Promise<string> {
  return readFile(fixturePath, "utf8");
}

describe("parseScheduleHtml", () => {
  it("preserves section identity and normalizes a repeated meeting pattern", async () => {
    const parsed = parseScheduleHtml(await fixture());

    expect(parsed.sections[0]).toEqual({
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
        {
          days: ["W", "F"],
          startTime: "08:40",
          endTime: "10:00",
          room: "CHL300",
        },
      ],
    });
  });

  it("keeps a secondary meeting pattern as an independent interval", async () => {
    const parsed = parseScheduleHtml(await fixture());

    expect(parsed.sections[1].meetings).toEqual([
      {
        days: ["M", "W", "F"],
        startTime: "13:10",
        endTime: "14:00",
        room: "ASC126",
      },
      {
        days: ["T"],
        startTime: "13:10",
        endTime: "14:30",
        room: "ASC126",
      },
    ]);
    expect(parsed.sections[1].instructors).toEqual(["Carter, P"]);
  });

  it("keeps an arranged section searchable without a placeable interval", async () => {
    const parsed = parseScheduleHtml(await fixture());

    expect(parsed.sections[2]).toMatchObject({
      crn: "80053",
      courseCode: "AMST 497Y",
      meetingStatus: "time-unavailable",
      meetings: [],
    });
  });

  it("accounts for an official wrapped room continuation", async () => {
    const parsed = parseScheduleHtml(await fixture());

    expect(parsed.sections[3].meetings[0].room).toBe("BLACKBOX THR");
  });

  it("classifies every non-empty source row", async () => {
    const parsed = parseScheduleHtml(await fixture());

    expect(parsed.rowCounts).toEqual({
      total: 9,
      header: 2,
      section: 4,
      continuation: 1,
      divider: 1,
      summary: 1,
    });
  });

  it("rejects a duplicate CRN", async () => {
    const html = await fixture();
    const row = html.split("\n").find((line) => line.startsWith("80565 "))!;

    expect(() => parseScheduleHtml(html.replace("      ****", `${row}\n      ****`))).toThrow(
      /duplicate CRN 80565/i,
    );
  });

  it("rejects an invalid day code", async () => {
    const html = (await fixture()).replace("WF     0840-1000", "WS     0840-1000");

    expect(() => parseScheduleHtml(html)).toThrow(/invalid day code S.*80565/i);
  });

  it("rejects a reversed meeting interval", async () => {
    const html = (await fixture()).replace("0840-1000", "1000-0840");

    expect(() => parseScheduleHtml(html)).toThrow(/meeting must end after it starts.*80565/i);
  });

  it("rejects an unaccounted source row", async () => {
    const html = (await fixture()).replace("      SUM", "unexpected source content\n      SUM");

    expect(() => parseScheduleHtml(html)).toThrow(/unaccounted schedule row/i);
  });
});

describe("assertFall2026ScheduleCompleteness", () => {
  const BASELINE = 629;

  // Only the section count is read, so fabricating length is sufficient.
  function scheduleOf(sectionCount: number): ParsedSchedule {
    return {
      sections: Array.from({ length: sectionCount }) as ParsedSchedule["sections"],
      rowCounts: {
        total: sectionCount,
        header: 0,
        section: sectionCount,
        continuation: 0,
        divider: 0,
        summary: 0,
      },
    };
  }

  it("accepts a count matching the reviewed baseline", () => {
    expect(assertFall2026ScheduleCompleteness(scheduleOf(BASELINE), BASELINE)).toEqual({
      baseline: BASELINE,
      actual: BASELINE,
      delta: 0,
      tolerance: 15,
    });
  });

  it("accepts an ordinary cancellation and records the delta", () => {
    expect(assertFall2026ScheduleCompleteness(scheduleOf(627), BASELINE)).toMatchObject({
      actual: 627,
      delta: -2,
    });
  });

  it("accepts a drop sitting exactly on the tolerance boundary", () => {
    expect(assertFall2026ScheduleCompleteness(scheduleOf(614), BASELINE)).toMatchObject({
      delta: -15,
    });
  });

  it("rejects a drop one section beyond the tolerance boundary", () => {
    expect(() => assertFall2026ScheduleCompleteness(scheduleOf(613), BASELINE)).toThrow(
      /613 sections.*16 below.*629.*tolerance of 15/i,
    );
  });

  it("rejects a truncated schedule outright", () => {
    expect(() => assertFall2026ScheduleCompleteness(scheduleOf(0), BASELINE)).toThrow(
      /below.*reviewed.*629/i,
    );
  });

  it("accepts a count above the baseline without a negative delta", () => {
    expect(assertFall2026ScheduleCompleteness(scheduleOf(640), BASELINE)).toMatchObject({
      delta: 11,
    });
  });

  it("scales tolerance with the baseline once 2% exceeds the floor", () => {
    expect(sectionCountTolerance(629)).toBe(15);
    expect(sectionCountTolerance(2000)).toBe(40);
  });

  it("rejects a non-positive baseline", () => {
    expect(() => assertFall2026ScheduleCompleteness(scheduleOf(10), 0)).toThrow(
      /positive integer/i,
    );
  });
});
