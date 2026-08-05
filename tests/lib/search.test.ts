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

const aliasSections: CourseSection[] = [
  {
    crn: "4",
    subject: "ARHS",
    catalogNumber: "221",
    sectionNumber: "00",
    courseCode: "ARHS 221",
    title: "Visual Culture",
    credits: 4,
    instructors: ["Ada Lovelace"],
    meetingStatus: "scheduled",
    meetings: [],
    prerequisite: { status: "unavailable" },
  },
  {
    crn: "5",
    subject: "PSYC",
    catalogNumber: "100",
    sectionNumber: "00",
    courseCode: "PSYC 100",
    title: "Introduction to Mind",
    credits: 4,
    instructors: ["Grace Hopper"],
    meetingStatus: "scheduled",
    meetings: [],
    prerequisite: { status: "unavailable" },
  },
  {
    crn: "6",
    subject: "COMP",
    catalogNumber: "101",
    sectionNumber: "00",
    courseCode: "COMP 101",
    title: "Programming Fundamentals",
    credits: 4,
    instructors: ["Katherine Johnson"],
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

  it.each([
    ["art history", ["4"]],
    ["psychology", ["5"]],
    ["computer science", ["6"]],
  ])("matches readable subject aliases for %s", (query, crns) => {
    expect(searchSections(aliasSections, query).map((section) => section.crn)).toEqual(crns);
  });

  it("requires every word in a multi-word query to match", () => {
    expect(searchSections(aliasSections, "art history").map((section) => section.crn)).toEqual(["4"]);
    expect(searchSections(aliasSections, "art physics")).toEqual([]);
  });
});
