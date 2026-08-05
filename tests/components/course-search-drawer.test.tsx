import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CourseSearchDrawer } from "@/components/planner/course-search-drawer";
import type { CourseSection } from "@/lib/courses/types";

afterEach(cleanup);

const sections: CourseSection[] = [
  {
    crn: "2", subject: "BIOL", catalogNumber: "112", sectionNumber: "00", courseCode: "BIOL 112", title: "Cells", credits: 4,
    instructors: ["Ada Lovelace"], meetingStatus: "scheduled", meetings: [],
    prerequisite: { status: "none", text: "No prerequisite.", sourceUrl: "https://example.edu" },
  },
  {
    crn: "1", subject: "AMST", catalogNumber: "140", sectionNumber: "00", courseCode: "AMST 140", title: "Prisons", credits: 4,
    instructors: ["Grace Hopper"], meetingStatus: "scheduled", meetings: [],
    prerequisite: { status: "unavailable" },
  },
];

describe("CourseSearchDrawer", () => {
  it("shows the search label and every supplied section without redundant browse copy", () => {
    render(<CourseSearchDrawer sections={sections} />);

    expect(screen.getByRole("complementary", { name: /course search/i })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: /search fall 2026 courses/i })).toBeInTheDocument();
    expect(screen.queryByText("Browse all Fall 2026 sections")).not.toBeInTheDocument();
    expect(screen.queryByText("2 sections")).not.toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(2);
  });

  it("updates real course-card results for a search and shows a clear no-results state", () => {
    render(<CourseSearchDrawer sections={sections} />);
    const search = screen.getByRole("searchbox", { name: /search fall 2026 courses/i });

    fireEvent.change(search, { target: { value: "lovelace" } });
    expect(screen.getByRole("heading", { name: /biol 112: cells/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /amst 140: prisons/i })).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: "not a course" } });
    expect(screen.getByText('No Fall 2026 sections match "not a course".')).toBeInTheDocument();
    expect(screen.queryAllByRole("article")).toHaveLength(0);
  });

  it("passes an Add action through to matching course cards", () => {
    const added: CourseSection[] = [];
    render(<CourseSearchDrawer sections={sections} onAdd={(section) => added.push(section)} />);

    fireEvent.click(screen.getByRole("button", { name: /^add amst 140$/i }));

    expect(added).toEqual([sections[1]]);
  });
});
