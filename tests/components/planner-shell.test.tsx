import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PlannerShell } from "@/components/planner/planner-shell";
import type { CourseSection } from "@/lib/courses/types";

afterEach(cleanup);

const sections: CourseSection[] = [
  {
    crn: "ONE",
    subject: "MATH",
    catalogNumber: "111",
    sectionNumber: "01",
    courseCode: "MATH 111",
    title: "Calculus A",
    credits: 4,
    instructors: ["Ada Lovelace"],
    meetingStatus: "scheduled",
    meetings: [
      { days: ["M"], startTime: "09:10", endTime: "10:00", room: "TOM101" },
    ],
    prerequisite: {
      status: "known",
      text: "Prerequisite: MATH 110.",
      sourceUrl: "https://example.edu",
    },
  },
  {
    crn: "TWO",
    subject: "PHYS",
    catalogNumber: "112",
    sectionNumber: "01",
    courseCode: "PHYS 112",
    title: "Physics A",
    credits: 4,
    instructors: ["Grace Hopper"],
    meetingStatus: "scheduled",
    meetings: [
      { days: ["M"], startTime: "09:30", endTime: "10:30", room: "TOM102" },
    ],
    prerequisite: {
      status: "none",
      text: "No prerequisite.",
      sourceUrl: "https://example.edu",
    },
  },
];

describe("PlannerShell", () => {
  it("uses Add and Remove to keep the drawer selection state and calendar projection in sync", () => {
    render(<PlannerShell sections={sections} />);

    fireEvent.click(screen.getByRole("button", { name: "Add MATH 111" }));

    expect(screen.getByRole("button", { name: "Added MATH 111" })).toBeDisabled();
    const event = screen.getByRole("article", { name: /math 111 section 01, monday/i });
    const remove = within(event).getByRole("button", { name: "Remove MATH 111 section 01" });
    remove.focus();
    fireEvent.click(remove);

    expect(screen.queryByRole("article", { name: /math 111 section 01, monday/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add MATH 111" })).toBeEnabled();
    expect(screen.getByRole("heading", { name: "Weekly schedule" })).toHaveFocus();
  });

  it("keeps planner selection unchanged while opening prerequisites and marks conflicts after adding both sections", () => {
    render(<PlannerShell sections={sections} />);

    fireEvent.click(screen.getByRole("button", { name: "Add MATH 111" }));
    fireEvent.click(screen.getByRole("button", { name: "Prereqs for PHYS 112" }));
    expect(screen.getByRole("dialog", { name: "Prerequisites for PHYS 112" })).toBeVisible();
    expect(screen.getAllByRole("button", { name: /^added /i })).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Add PHYS 112" }));

    expect(screen.getAllByRole("status", { name: /^conflict with /i })).toHaveLength(2);
  });
});
