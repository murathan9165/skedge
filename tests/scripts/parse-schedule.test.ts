import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { parseScheduleHtml } from "../../scripts/courses/parse-schedule";

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
