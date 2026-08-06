import "@testing-library/jest-dom/vitest";
import { DragDropProvider } from "@dnd-kit/react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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
  it("renders the course name, instructor, compact meeting details, and every time range", () => {
    render(<CourseCard section={scheduledSection} onAdd={() => {}} />);

    const heading = screen.getByRole("heading", { name: /amst 140: prisons, policing/i });
    expect(heading).toBeInTheDocument();
    expect(heading).toHaveTextContent("8:40 AM–10:00 AM / 1:10 PM–2:30 PM");
    expect(screen.getByText("Dr. Staff")).toBeInTheDocument();
    expect(screen.getByText("Wed, Fri · CHL300")).toBeInTheDocument();
    expect(screen.getByText("Mon · HSA220")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^add amst 140$/i })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /drag amst 140/i })).not.toBeInTheDocument();
    expect(screen.getByRole("article")).toHaveAttribute("data-drag-enabled", "true");
  });

  it("keeps seat availability and PI metadata visible when enrollment is unavailable", () => {
    render(
      <CourseCard
        section={{ ...scheduledSection, permission: "PI", seatLimit: 15, seatsEnrolled: null }}
        onAdd={() => {}}
      />,
    );

    expect(screen.getByText("4 credits · seats: ? of 15 filled. (PI)")).toBeInTheDocument();
  });

  it("keeps Add and Prerequisites controls interactive on a draggable card", () => {
    const onAdd = vi.fn();
    render(<CourseCard section={scheduledSection} onAdd={onAdd} />);

    fireEvent.click(screen.getByRole("button", { name: /^add amst 140$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^prerequisites for amst 140$/i }));

    expect(onAdd).toHaveBeenCalledOnce();
    expect(onAdd).toHaveBeenCalledWith(scheduledSection);
    expect(screen.getByRole("dialog", { name: /prerequisites for amst 140/i })).toBeInTheDocument();
  });

  it("uses the details surface, rather than the card container, as the accessible drag activator", async () => {
    render(
      <DragDropProvider>
        <CourseCard section={scheduledSection} onAdd={() => {}} />
      </DragDropProvider>,
    );

    const card = screen.getByRole("article");
    const details = card.querySelector(".course-card__details");

    expect(details).not.toBeNull();
    await waitFor(() => expect(details).toHaveAttribute("role", "button"));
    expect(details).toHaveAttribute("tabindex", "0");
    expect(card).not.toHaveAttribute("role", "button");
  });

  it("uses an Added disabled state for a selected scheduled section", () => {
    render(<CourseCard section={scheduledSection} onAdd={() => {}} selected />);

    expect(screen.getByRole("button", { name: /^added amst 140$/i })).toBeDisabled();
    expect(screen.getByRole("article")).not.toHaveAttribute("data-drag-enabled");
  });

  it("keeps prerequisites available but disables Add and dragging when time is unavailable", () => {
    const untimedSection = {
      ...scheduledSection,
      crn: "80566",
      meetingStatus: "time-unavailable" as const,
      meetings: [],
    };

    render(<CourseCard section={untimedSection} onAdd={() => {}} />);

    expect(screen.getByText("Time unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^add amst 140$/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^prerequisites for amst 140$/i })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /drag amst 140/i })).not.toBeInTheDocument();
    expect(screen.getByRole("article")).not.toHaveAttribute("data-drag-enabled");
    expect(screen.getByRole("article")).not.toHaveAttribute("draggable", "true");
    expect(screen.getByRole("article").querySelector(".course-card__details")).toHaveAttribute("tabindex", "-1");

    fireEvent.click(screen.getByRole("button", { name: /^prerequisites for amst 140$/i }));
    expect(screen.getByRole("dialog", { name: /prerequisites for amst 140/i })).toBeInTheDocument();
  });
});
