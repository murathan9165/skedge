import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CourseCard } from "@/components/planner/course-card";
import type { CourseSection, Prerequisite } from "@/lib/courses/types";

afterEach(cleanup);

function sectionWith(prerequisite: Prerequisite): CourseSection {
  return {
    crn: "80565",
    subject: "AMST",
    catalogNumber: "140",
    sectionNumber: "00",
    courseCode: "AMST 140",
    title: "Prisons, Policing, & Amer Cult",
    credits: 4,
    instructors: ["Dr. Staff"],
    meetingStatus: "scheduled",
    meetings: [],
    prerequisite,
  };
}

describe("prerequisite disclosure", () => {
  it.each([
    [{ status: "known", text: "Prerequisite: AMST 101.", sourceUrl: "https://example.edu/known" } as const, "Prerequisite: AMST 101.", "https://example.edu/known"],
    [{ status: "none", text: "No prerequisite.", sourceUrl: "https://example.edu/none" } as const, "No prerequisite.", "https://example.edu/none"],
    [{ status: "unavailable" } as const, "Prerequisite information unavailable.", null],
  ])("renders %s prerequisite information distinctly", (prerequisite, expectedText, sourceUrl) => {
    render(<CourseCard section={sectionWith(prerequisite)} onAdd={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: /^prereqs for amst 140$/i }));

    const dialog = screen.getByRole("dialog", { name: /prerequisites for amst 140/i });
    expect(dialog).toHaveTextContent(expectedText);
    expect(dialog).toHaveTextContent(/reference material only/i);
    const sourceLink = screen.queryByRole("link", { name: /official prerequisite source/i });
    if (sourceUrl === null) {
      expect(sourceLink).not.toBeInTheDocument();
    } else {
      expect(sourceLink).toHaveAttribute("href", sourceUrl);
    }
  });

  it("closes disclosure by pointer and restores focus to its trigger", () => {
    render(<CourseCard section={sectionWith({ status: "unavailable" })} onAdd={() => {}} />);
    const trigger = screen.getByRole("button", { name: /^prereqs for amst 140$/i });

    fireEvent.click(trigger);
    const popover = screen.getByRole("dialog", { name: /prerequisites for amst 140/i });

    expect(popover.parentElement).toHaveClass("course-card__prerequisites");
    fireEvent.pointerDown(document.body);

    expect(screen.queryByRole("dialog", { name: /prerequisites for amst 140/i })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("closes by keyboard control and Escape, returning focus to its trigger", () => {
    render(<CourseCard section={sectionWith({ status: "unavailable" })} onAdd={() => {}} />);
    const trigger = screen.getByRole("button", { name: /^prereqs for amst 140$/i });

    fireEvent.click(trigger);
    const closeButton = screen.getByRole("button", { name: /close prerequisites/i });
    closeButton.focus();
    fireEvent.keyDown(closeButton, { key: "Enter" });
    expect(screen.queryByRole("dialog", { name: /prerequisites for amst 140/i })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: /prerequisites for amst 140/i })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
