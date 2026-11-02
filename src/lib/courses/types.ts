export type MeetingDay = "M" | "T" | "W" | "R" | "F";

export interface MeetingInterval {
  days: MeetingDay[];
  startTime: string;
  endTime: string;
  room: string;
}

export interface ImportedScheduleSection {
  crn: string;
  subject: string;
  catalogNumber: string;
  sectionNumber: string;
  courseCode: string;
  title: string;
  credits: number;
  permission?: string | null;
  seatLimit?: number | null;
  seatsEnrolled?: number | null;
  instructors: string[];
  meetingStatus: "scheduled" | "time-unavailable";
  meetings: MeetingInterval[];
}

export type Prerequisite =
  | { status: "known"; text: string; sourceUrl: string }
  | { status: "none"; text: string; sourceUrl: string }
  | { status: "unavailable" };

export interface CourseSection extends ImportedScheduleSection {
  prerequisite: Prerequisite;
}

export interface CourseSnapshot {
  schemaVersion: 1;
  term: { id: "spring-2027"; label: "Spring 2027" };
  importedAt: string;
  sections: CourseSection[];
}

export interface ScheduleRowCounts {
  total: number;
  header: number;
  section: number;
  continuation: number;
  divider: number;
  summary: number;
}

export interface ImportReport {
  schemaVersion: 1;
  term: "spring-2027";
  importedAt: string;
  sources: {
    schedule: { url: string; retrievedAt: string };
    catalogIndex: { url: string; retrievedAt: string };
    catalogPages: Array<{ url: string; retrievedAt: string; courseCount: number }>;
  };
  counts: {
    scheduleRows: ScheduleRowCounts;
    catalogPages: number;
    catalogCourses: number;
    sections: number;
    prerequisites: { known: number; none: number; unavailable: number };
  };
  /** Section count measured against the reviewed baseline and its tolerance. */
  completeness: {
    baseline: number;
    actual: number;
    delta: number;
    tolerance: number;
  };
  unmatchedPrerequisites: Array<{
    crn: string;
    courseCode: string;
    title: string;
    reason: "catalog-course-not-found" | "catalog-prerequisite-unavailable" | "special-topic";
  }>;
}
