import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { WeeklyCalendar } from "@/components/planner/weekly-calendar";
import type { CourseSection, MeetingDay } from "@/lib/courses/types";

afterEach(cleanup);

function sectionWith(
  crn: string,
  courseCode: string,
  day: MeetingDay,
  startTime: string,
  endTime: string,
): CourseSection {
  return {
    crn,
    subject: courseCode.split(" ")[0],
    catalogNumber: courseCode.split(" ")[1],
    sectionNumber: "00",
    courseCode,
    title: `Title for ${courseCode}`,
    credits: 4,
    instructors: ["Dr. Staff"],
    meetingStatus: "scheduled",
    meetings: [{ days: [day], startTime, endTime, room: `ROOM-${crn}` }],
    prerequisite: { status: "none", text: "No prerequisite.", sourceUrl: "https://example.edu" },
  };
}

describe("WeeklyCalendar", () => {
  it("renders early, late, short, and long official meetings within the stable bounds", () => {
    render(
      <WeeklyCalendar
        sections={[
          sectionWith("EARLY", "ARTS 101", "M", "08:10", "09:30"),
          sectionWith("SHORT", "BIOL 102", "T", "10:00", "10:20"),
          sectionWith("LONG", "CHEM 103", "W", "08:10", "11:00"),
          sectionWith("LATE", "DRAM 104", "F", "19:00", "22:00"),
        ]}
        onRemove={() => {}}
      />,
    );

    expect(screen.getByRole("grid", { name: "Monday through Friday class schedule" })).toHaveStyle({ height: "960px" });
    expect(screen.getByRole("row", { name: "Monday" })).toHaveStyle({ position: "relative" });
    expect(screen.getByRole("article", { name: /arts 101 section 00, monday/i })).toHaveStyle({ position: "absolute", top: "70px", height: "80px" });
    expect(screen.getByRole("article", { name: /biol 102 section 00, tuesday/i })).toHaveStyle({ top: "180px", height: "20px" });
    expect(screen.getByRole("article", { name: /chem 103 section 00, wednesday/i })).toHaveStyle({ top: "70px", height: "170px" });
    expect(screen.getByRole("article", { name: /dram 104 section 00, friday/i })).toHaveStyle({ top: "720px", height: "180px" });

    expect(screen.getByText("7:00 AM")).toHaveStyle({ position: "absolute", top: "0px" });
    expect(screen.getByText("11:00 PM")).toBeInTheDocument();
    expect(screen.getByText("ROOM-LATE")).toBeInTheDocument();
  });

  it("keeps both overlapping meetings visible with non-color conflict status", () => {
    render(
      <WeeklyCalendar
        sections={[
          sectionWith("ONE", "MATH 111", "M", "09:00", "10:00"),
          sectionWith("TWO", "PHYS 112", "M", "09:30", "10:30"),
        ]}
        onRemove={() => {}}
      />,
    );

    const mathEvent = screen.getByRole("article", { name: /math 111 section 00, monday/i });
    const physicsEvent = screen.getByRole("article", { name: /phys 112 section 00, monday/i });

    expect(within(mathEvent).getByRole("status", { name: /conflict with phys 112/i })).toHaveTextContent("Conflict");
    expect(within(physicsEvent).getByRole("status", { name: /conflict with math 111/i })).toHaveTextContent("Conflict");
    expect(mathEvent).toHaveStyle({ left: "0%", width: "50%" });
    expect(physicsEvent).toHaveStyle({ left: "50%", width: "50%" });
  });

  it("removes a section through an accessibly named keyboard-operable button", () => {
    const removedCrns: string[] = [];
    render(
      <WeeklyCalendar
        sections={[sectionWith("80565", "AMST 140", "W", "08:40", "10:00")]}
        onRemove={(crn) => removedCrns.push(crn)}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove AMST 140 section 00" }));

    expect(removedCrns).toEqual(["80565"]);
  });
});
