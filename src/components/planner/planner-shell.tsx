"use client";

import { DragDropProvider, type DragEndEvent } from "@dnd-kit/react";
import {
  useEffect,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type SyntheticEvent,
} from "react";

import snapshot from "@/data/fall-2026.json";
import {
  initialPlannerState,
  plannerReducer,
} from "@/lib/courses/planner-state";
import type { CourseSection, CourseSnapshot } from "@/lib/courses/types";

import { CourseSearchDrawer } from "./course-search-drawer";
import {
  WEEKLY_CALENDAR_DROP_ID,
  WeeklyCalendar,
} from "./weekly-calendar";

const snapshotSections = (snapshot as CourseSnapshot).sections;
const narrowDrawerQuery = "(max-width: 52rem)";

function subscribeToNarrowViewport(onStoreChange: () => void) {
  if (typeof window.matchMedia !== "function") return () => {};

  const mediaQuery = window.matchMedia(narrowDrawerQuery);
  mediaQuery.addEventListener("change", onStoreChange);
  return () => mediaQuery.removeEventListener("change", onStoreChange);
}

function getNarrowViewportSnapshot() {
  return typeof window.matchMedia === "function" &&
    window.matchMedia(narrowDrawerQuery).matches;
}

function showDialog(dialog: HTMLDialogElement, modal: boolean) {
  if (dialog.open) closeDialog(dialog);

  if (modal && typeof dialog.showModal === "function") {
    dialog.showModal();
  } else if (!modal && typeof dialog.show === "function") {
    dialog.show();
  } else {
    dialog.setAttribute("open", "");
  }
}

function closeDialog(dialog: HTMLDialogElement) {
  if (!dialog.open) return;

  if (typeof dialog.close === "function") {
    dialog.close();
  } else {
    dialog.removeAttribute("open");
  }
}

interface PlannerShellProps {
  sections?: CourseSection[];
}

export function PlannerShell({ sections = snapshotSections }: PlannerShellProps) {
  const [state, dispatch] = useReducer(plannerReducer, initialPlannerState);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const isNarrow = useSyncExternalStore(
    subscribeToNarrowViewport,
    getNarrowViewportSnapshot,
    () => false,
  );
  const drawerPanelRef = useRef<HTMLDialogElement>(null);
  const drawerToggleRef = useRef<HTMLButtonElement>(null);
  const drawerHadFocusRef = useRef(false);
  const selectedSections = sections.filter((section) =>
    state.selectedCrns.includes(section.crn),
  );

  function selectCrn(crn: string) {
    dispatch({ type: "add", crn });
  }

  function finishDrag(event: DragEndEvent) {
    const { source, target } = event.operation;
    const crn = source?.data.crn;
    const section = sections.find((candidate) => candidate.crn === crn);

    if (
      event.canceled ||
      target?.id !== WEEKLY_CALENDAR_DROP_ID ||
      !section ||
      section.meetingStatus === "time-unavailable"
    ) {
      return;
    }

    selectCrn(section.crn);
  }

  function closeDrawer() {
    if (drawerPanelRef.current) closeDialog(drawerPanelRef.current);
    setIsDrawerOpen(false);
    drawerToggleRef.current?.focus();
    drawerHadFocusRef.current = false;
  }

  useEffect(() => {
    const dialog = drawerPanelRef.current;
    if (!dialog) return;

    if (isNarrow && !isDrawerOpen) {
      const focusWasInDrawer =
        dialog.contains(document.activeElement) || drawerHadFocusRef.current;
      closeDialog(dialog);
      if (focusWasInDrawer) {
        drawerToggleRef.current?.focus();
        drawerHadFocusRef.current = false;
      }
      return;
    }

    const focusedBeforeSync = document.activeElement as HTMLElement | null;
    showDialog(dialog, isNarrow);
    if (isNarrow) {
      dialog.querySelector<HTMLInputElement>("input")?.focus();
    } else if (
      focusedBeforeSync &&
      focusedBeforeSync !== document.body &&
      focusedBeforeSync.isConnected
    ) {
      focusedBeforeSync.focus();
    } else if (dialog.contains(document.activeElement)) {
      (document.activeElement as HTMLElement).blur();
    }
  }, [isDrawerOpen, isNarrow]);

  function cancelDrawer(event: SyntheticEvent<HTMLDialogElement>) {
    if (!isNarrow) return;

    event.preventDefault();
    closeDrawer();
  }

  function keepFocusInDrawer(event: ReactKeyboardEvent<HTMLDialogElement>) {
    if (!isNarrow || event.key !== "Tab") return;

    const focusableElements = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => element.getClientRects().length > 0);
    const first = focusableElements.at(0);
    const last = focusableElements.at(-1);

    if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  function dismissDrawerBackdrop(event: ReactMouseEvent<HTMLDialogElement>) {
    if (!isNarrow || event.target !== event.currentTarget) return;

    const bounds = event.currentTarget.getBoundingClientRect();
    const isOutsideDrawer =
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom;
    if (isOutsideDrawer) closeDrawer();
  }

  return (
    <DragDropProvider onDragEnd={finishDrag}>
      <button
        ref={drawerToggleRef}
        type="button"
        className="planner-shell__drawer-toggle"
        aria-controls="course-search-panel"
        aria-expanded={isDrawerOpen}
        aria-label="Open course search"
        onClick={() => setIsDrawerOpen(true)}
      >
        Find courses
      </button>
      <div className="planner-shell">
        <WeeklyCalendar
          sections={selectedSections}
          onRemove={(crn) => dispatch({ type: "remove", crn })}
        />
        <dialog
          ref={drawerPanelRef}
          id="course-search-panel"
          className="planner-shell__drawer-panel"
          data-drawer-open={isDrawerOpen}
          tabIndex={-1}
          aria-modal={isNarrow && isDrawerOpen ? true : undefined}
          aria-label={isNarrow ? "Course search drawer" : undefined}
          onFocusCapture={() => {
            drawerHadFocusRef.current = true;
          }}
          onBlurCapture={(event) => {
            if (
              event.relatedTarget instanceof Node &&
              !event.currentTarget.contains(event.relatedTarget)
            ) {
              drawerHadFocusRef.current = false;
            }
          }}
          onCancel={cancelDrawer}
          onClick={dismissDrawerBackdrop}
          onKeyDown={keepFocusInDrawer}
        >
          <button
            type="button"
            className="planner-shell__drawer-close"
            aria-label="Close course search"
            onClick={closeDrawer}
          >
            Close
          </button>
          <CourseSearchDrawer
            sections={sections}
            selectedCrns={state.selectedCrns}
            onAdd={(section) => selectCrn(section.crn)}
          />
        </dialog>
      </div>
    </DragDropProvider>
  );
}
