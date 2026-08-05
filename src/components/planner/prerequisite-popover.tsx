"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

import type { CourseSection } from "@/lib/courses/types";

interface PrerequisitePopoverProps {
  section: CourseSection;
  triggerRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}

function prerequisiteText(section: CourseSection) {
  if (section.prerequisite.status === "unavailable") {
    return "Prerequisite information unavailable.";
  }

  return section.prerequisite.text;
}

export function PrerequisitePopover({
  section,
  triggerRef,
  onClose,
}: PrerequisitePopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{
    left: number;
    placement: "above" | "below";
    top: number;
  } | null>(null);

  useLayoutEffect(() => {
    const popover = popoverRef.current;
    const trigger = triggerRef.current;
    if (!popover || !trigger) return;

    function updatePosition() {
      const popoverBounds = popover!.getBoundingClientRect();
      const triggerBounds = trigger!.getBoundingClientRect();
      const margin = 8;
      const gap = 8;
      const maximumLeft = Math.max(
        margin,
        window.innerWidth - popoverBounds.width - margin,
      );
      const left = Math.min(
        Math.max(margin, triggerBounds.left),
        maximumLeft,
      );
      const aboveTop = triggerBounds.top - gap - popoverBounds.height;
      const belowTop = triggerBounds.bottom + gap;
      const fitsAbove = aboveTop >= margin;
      const fitsBelow =
        belowTop + popoverBounds.height <= window.innerHeight - margin;
      let placement: "above" | "below" = "above";
      let desiredTop = aboveTop;

      if (!fitsAbove && fitsBelow) {
        placement = "below";
        desiredTop = belowTop;
      } else if (!fitsAbove && !fitsBelow) {
        const spaceAbove = triggerBounds.top - gap - margin;
        const spaceBelow = window.innerHeight - margin - triggerBounds.bottom - gap;
        if (spaceBelow > spaceAbove) {
          placement = "below";
          desiredTop = belowTop;
        }
      }

      const maximumTop = Math.max(
        margin,
        window.innerHeight - popoverBounds.height - margin,
      );
      setPosition({
        left,
        placement,
        top: Math.min(Math.max(margin, desiredTop), maximumTop),
      });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    const resizeObserver =
      typeof ResizeObserver === "function"
        ? new ResizeObserver(updatePosition)
        : null;
    resizeObserver?.observe(popover);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      resizeObserver?.disconnect();
    };
  }, [triggerRef]);

  useEffect(() => {
    function closeForPointerOutside(event: PointerEvent) {
      const target = event.target as Node;
      if (
        !popoverRef.current?.contains(target) &&
        !triggerRef.current?.contains(target)
      ) {
        onClose();
      }
    }

    function closeForEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    }

    document.addEventListener("pointerdown", closeForPointerOutside);
    document.addEventListener("keydown", closeForEscape);
    return () => {
      document.removeEventListener("pointerdown", closeForPointerOutside);
      document.removeEventListener("keydown", closeForEscape);
    };
  }, [onClose, triggerRef]);

  function closeFromKeyboard(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onClose();
    }
  }

  return (
    <div
      ref={popoverRef}
      className="prerequisite-popover"
      data-placement={position?.placement ?? "above"}
      role="dialog"
      aria-label={`Prerequisites for ${section.courseCode}`}
      style={
        position
          ? { left: position.left, top: position.top }
          : { visibility: "hidden" }
      }
    >
      <p>{prerequisiteText(section)}</p>
      <p className="prerequisite-popover__disclaimer">
        Reference material only. Confirm current requirements with Kenyon.
      </p>
      {section.prerequisite.status !== "unavailable" ? (
        <a
          href={section.prerequisite.sourceUrl}
          target="_blank"
          rel="noreferrer"
          aria-label={`Official prerequisite source for ${section.courseCode}`}
        >
          View official source
        </a>
      ) : null}
      <button type="button" onClick={onClose} onKeyDown={closeFromKeyboard}>
        Close prerequisites
      </button>
    </div>
  );
}
