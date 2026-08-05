import { describe, expect, it } from "vitest";

import { searchSections } from "@/lib/courses/search";
import type { CourseSection } from "@/lib/courses/types";

const sections: CourseSection[] = [
  {
    crn: "3",
    subject: "MUSC",
    catalogNumber: "101",
    sectionNumber: "02",
    courseCode: "MUSC 101",
    title: "Music Theory",
    credits: 4,
    instructors: ["Ada Lovelace"],
    meetingStatus: "scheduled",
    meetings: [],
    prerequisite: { status: "none", text: "No prerequisite.", sourceUrl: "https://example.edu" },
  },
  {
    crn: "2",
    subject: "AMST",
    catalogNumber: "200",
    sectionNumber: "01",
    courseCode: "AMST 200",
    title: "American Cultures",
    credits: 4,
    instructors: ["Grace Hopper"],
    meetingStatus: "scheduled",
    meetings: [],
    prerequisite: { status: "unavailable" },
  },
  {
    crn: "1",
    subject: "AMST",
    catalogNumber: "200",
    sectionNumber: "00",
    courseCode: "AMST 200",
    title: "American Cultures",
    credits: 4,
    instructors: ["Grace Hopper"],
    meetingStatus: "scheduled",
    meetings: [],
    prerequisite: { status: "unavailable" },
  },
];

describe("searchSections", () => {
  it.each([
    ["amst", ["1", "2"]],
    ["200", ["1", "2"]],
    ["AMST 200", ["1", "2"]],
    ["cultures", ["1", "2"]],
    ["LOVELACE", ["3"]],
  ])("matches subject, number, code, title, and instructor case-insensitively for %s", (query, crns) => {
    expect(searchSections(sections, query).map((section) => section.crn)).toEqual(crns);
  });

  it("returns every section in stable subject, catalog number, and section order for an empty browse query", () => {
    expect(searchSections(sections, "").map((section) => section.crn)).toEqual(["1", "2", "3"]);
  });
});
