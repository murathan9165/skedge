import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CourseCard } from "@/components/planner/course-card";
import type { CourseSection } from "@/lib/courses/types";

afterEach(cleanup);

const scheduledSection: CourseSection = {
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

describe("CourseCard", () => {
  it("renders the course name, instructor, and every formatted meeting pattern", () => {
    render(<CourseCard section={scheduledSection} onAdd={() => {}} />);

    expect(screen.getByRole("heading", { name: /amst 140: prisons, policing/i })).toBeInTheDocument();
    expect(screen.getByText("Dr. Staff")).toBeInTheDocument();
    expect(screen.getByText("Wed, Fri · 8:40 AM–10:00 AM · CHL300")).toBeInTheDocument();
    expect(screen.getByText("Mon · 1:10 PM–2:30 PM · HSA220")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^add amst 140$/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /drag amst 140 to weekly schedule/i })).toBeEnabled();
  });

  it("uses an Added disabled state for a selected scheduled section", () => {
    render(<CourseCard section={scheduledSection} onAdd={() => {}} selected />);

    expect(screen.getByRole("button", { name: /^added amst 140$/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /drag amst 140 to weekly schedule/i })).toBeDisabled();
  });

  it("keeps prereqs available but disables Add and dragging when time is unavailable", () => {
    const untimedSection = {
      ...scheduledSection,
      crn: "80566",
      meetingStatus: "time-unavailable" as const,
      meetings: [],
    };

    render(<CourseCard section={untimedSection} onAdd={() => {}} />);

    expect(screen.getByText("Time unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^add amst 140$/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^prereqs for amst 140$/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /drag amst 140 to weekly schedule/i })).toBeDisabled();
    expect(screen.getByRole("article")).not.toHaveAttribute("draggable", "true");

    fireEvent.click(screen.getByRole("button", { name: /^prereqs for amst 140$/i }));
    expect(screen.getByRole("dialog", { name: /prerequisites for amst 140/i })).toBeInTheDocument();
  });
});
