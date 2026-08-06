"use client";

import { useDraggable } from "@dnd-kit/react";
import { useRef, useState } from "react";

import { PrerequisitePopover } from "./prerequisite-popover";
import type { CourseSection, MeetingDay, MeetingInterval } from "@/lib/courses/types";

interface CourseCardProps {
  section: CourseSection;
  onAdd?: (section: CourseSection) => void;
  selected?: boolean;
  addDisabled?: boolean;
}

const dayLabels: Record<MeetingDay, string> = {
  M: "Mon",
  T: "Tue",
  W: "Wed",
  R: "Thu",
  F: "Fri",
};

function formatTime(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minute.toString().padStart(2, "0")} ${suffix}`;
}

function formatMeeting(meeting: MeetingInterval) {
  const days = meeting.days.map((day) => dayLabels[day]).join(", ");
  const location = meeting.room ? ` · ${meeting.room}` : "";
  return `${days}${location}`;
}

function formatTimeRange(meeting: MeetingInterval) {
  return `${formatTime(meeting.startTime)}–${formatTime(meeting.endTime)}`;
}

function formatTimeSummary(meetings: MeetingInterval[]) {
  return [...new Set(meetings.map(formatTimeRange))].join(" / ");
}

function formatSeatSummary(section: CourseSection) {
  const credits = `${section.credits} credits`;
  const permission = section.permission === "PI" ? " (PI)" : "";
  if (section.seatLimit === null || section.seatsEnrolled === null) {
    const limit = section.seatLimit === null ? "?" : section.seatLimit;
    return `${credits} · seats: ? of ${limit} filled.${permission}`;
  }
  return `${credits} · seats: ${section.seatsEnrolled} of ${section.seatLimit} filled.${permission}`;
}

export function CourseCard({
  section,
  onAdd,
  selected = false,
  addDisabled = false,
}: CourseCardProps) {
  const [isPrerequisiteOpen, setIsPrerequisiteOpen] = useState(false);
  const prerequisiteTriggerRef = useRef<HTMLButtonElement>(null);
  const isUntimed = section.meetingStatus === "time-unavailable";
  const isAddDisabled = isUntimed || selected || addDisabled || !onAdd;
  const seatSummary = formatSeatSummary(section);
  const {
    ref: draggableRef,
    handleRef,
    isDragging,
  } = useDraggable({
    id: `course-${section.crn}`,
    type: "course-section",
    data: { crn: section.crn },
    disabled: isAddDisabled,
  });

  function closePrerequisites() {
    setIsPrerequisiteOpen(false);
    prerequisiteTriggerRef.current?.focus();
  }

  return (
    <article
      ref={draggableRef}
      className={`course-card${isDragging ? " course-card--dragging" : ""}`}
      data-section-number={section.sectionNumber}
      data-drag-enabled={isAddDisabled ? undefined : "true"}
      draggable={false}
    >
      <div
        ref={handleRef}
        className="course-card__details"
        tabIndex={isAddDisabled ? -1 : undefined}
      >
        <div className="course-card__identity">
          <h3 aria-label={`${section.courseCode}: ${section.title}`}>
            <span>{section.courseCode}</span>
            {!isUntimed ? <time>{formatTimeSummary(section.meetings)}</time> : null}
          </h3>
          <p className="course-card__title">{section.title}</p>
        </div>
        <p className="course-card__instructor">{section.instructors.join(", ") || "Instructor unavailable"}</p>
        {seatSummary ? <p className="course-card__availability">{seatSummary}</p> : null}
        {isUntimed ? (
          <p className="course-card__unavailable">Time unavailable</p>
        ) : (
          <ul className="course-card__meetings" aria-label={`Meeting times for ${section.courseCode}`}>
            {section.meetings.map((meeting, index) => (
              <li key={`${meeting.days.join("")}-${meeting.startTime}-${index}`}>
                {formatMeeting(meeting)}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="course-card__actions">
        <button
          type="button"
          disabled={isAddDisabled}
          aria-label={`${selected ? "Added" : "Add"} ${section.courseCode}`}
          onClick={() => onAdd?.(section)}
        >
          {selected ? "Added" : "Add"}
        </button>
        <div className="course-card__prerequisites">
          <button
            ref={prerequisiteTriggerRef}
            type="button"
            aria-label={`Prerequisites for ${section.courseCode}`}
            aria-expanded={isPrerequisiteOpen}
            aria-haspopup="dialog"
            onClick={() => setIsPrerequisiteOpen((isOpen) => !isOpen)}
          >
            Prerequisites
          </button>
          {isPrerequisiteOpen ? (
            <PrerequisitePopover
              section={section}
              triggerRef={prerequisiteTriggerRef}
              onClose={closePrerequisites}
            />
          ) : null}
        </div>
      </div>
    </article>
  );
}
