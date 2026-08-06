import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import type {
  CourseSection,
  CourseSnapshot,
  ImportReport,
  Prerequisite,
} from "../../src/lib/courses/types";
import {
  normalizeCourseKey,
  CatalogStructureError,
  parseCatalogCoursePage,
  parseCatalogIndexHtml,
  parseCatalogSubpageLinks,
  type CatalogCourse,
} from "./parse-catalog";
import {
  assertFall2026ScheduleCompleteness,
  FALL_2026_REVIEWED_MINIMUM_SECTION_COUNT,
  parseScheduleHtml,
  sectionCountTolerance,
} from "./parse-schedule";

export const SCHEDULE_URL = "https://registrar.kenyon.edu/sep26_dept.htm";
export const CATALOG_INDEX_URL =
  "https://www.kenyon.edu/offices-and-services/registrar/kenyon-college-course-catalog/course-offerings/";
const DEFAULT_SOURCE_REQUEST_TIMEOUT_MS = 60_000;
const DEFAULT_MAXIMUM_CATALOG_DEPTH = 4;
const DEFAULT_MAXIMUM_CATALOG_PAGES = 100;
const MAXIMUM_SOURCE_REDIRECTS = 5;
const DEFAULT_MAXIMUM_ATTEMPTS = 3;
const DEFAULT_RETRY_BASE_DELAY_MS = 500;
const DEFAULT_CATALOG_CONCURRENCY = 4;

/**
 * Identifies the importer to Kenyon's servers. A scheduled job that scrapes
 * anonymously and in bursts is indistinguishable from abuse; naming ourselves
 * and linking the project makes the traffic accountable.
 */
const SOURCE_USER_AGENT =
  "kenyon-class-schedule-planner/0.1 (+https://github.com/murathan9165/skedge)";

interface ImportOptions {
  fetchImpl?: typeof fetch;
  snapshotPath?: string;
  reportPath?: string;
  now?: () => Date;
  renameFile?: typeof rename;
  minimumSectionCount?: number;
  maximumCatalogDepth?: number;
  maximumCatalogPages?: number;
  requestTimeoutMs?: number;
  maximumAttempts?: number;
  retryBaseDelayMs?: number;
  catalogConcurrency?: number;
  sleep?: (milliseconds: number) => Promise<void>;
}

/** A failure worth another attempt: timeouts, connection errors, 429, and 5xx. */
class TransientSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransientSourceError";
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

/**
 * Caps requests in flight. Gating the request itself rather than the traversal
 * keeps the cap global no matter how the recursive catalog discovery fans out.
 */
function createRequestLimiter(
  limit: number,
): <T>(task: () => Promise<T>) => Promise<T> {
  let active = 0;
  const waiting: Array<() => void> = [];

  return async function run<T>(task: () => Promise<T>): Promise<T> {
    if (active >= limit) {
      await new Promise<void>((resolve) => waiting.push(resolve));
    }
    active += 1;
    try {
      return await task();
    } finally {
      active -= 1;
      waiting.shift()?.();
    }
  };
}

interface FetchPolicy {
  fetchImpl: typeof fetch;
  requestTimeoutMs: number;
  maximumAttempts: number;
  retryBaseDelayMs: number;
  sleep: (milliseconds: number) => Promise<void>;
  runRequest: <T>(task: () => Promise<T>) => Promise<T>;
}

type SourceKind = "schedule" | "catalog";

const approvedSourceUrls: Record<SourceKind, URL> = {
  schedule: new URL(SCHEDULE_URL),
  catalog: new URL(CATALOG_INDEX_URL),
};

function assertion(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive integer`);
  }
  return value;
}

function nonNegativeInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return value;
}

function minimumSectionCountFromEnvironment(): number {
  const override = process.env.KENYON_FALL_2026_MINIMUM_SECTIONS;
  if (override === undefined) return FALL_2026_REVIEWED_MINIMUM_SECTION_COUNT;
  if (!/^\d+$/.test(override)) {
    throw new Error(
      "KENYON_FALL_2026_MINIMUM_SECTIONS must be a positive integer maintenance override",
    );
  }
  return positiveInteger(
    Number(override),
    "KENYON_FALL_2026_MINIMUM_SECTIONS maintenance override",
  );
}

function assertApprovedSourceUrl(
  value: string,
  kind: SourceKind,
  isFinal = false,
): string {
  const approvedSource = approvedSourceUrls[kind];
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid ${kind} source URL: ${value}`);
  }
  const approved =
    url.origin === approvedSource.origin &&
    url.username === "" &&
    url.password === "";
  if (!approved) {
    if (isFinal) {
      throw new Error(
        `Final URL is not an approved ${kind} source on ${approvedSource.hostname}: ${value}`,
      );
    }
    throw new Error(
      `Approved ${kind} source URLs must use HTTPS host ${approvedSource.hostname}: ${value}`,
    );
  }
  url.hash = "";
  return url.href;
}

const FALLBACK_SOURCE_CHARSET = "windows-1252";
const CHARSET_SNIFF_BYTES = 2048;

function charsetFromContentType(header: string | null): string | null {
  if (!header) return null;
  const match = /charset=["']?([^"';,\s]+)/i.exec(header);
  return match ? match[1].toLowerCase() : null;
}

function charsetFromMetaTag(bytes: Uint8Array): string | null {
  // Charset declarations are ASCII-safe, so sniffing the head as ASCII is
  // sufficient to find one without knowing the encoding yet.
  const head = new TextDecoder("ascii").decode(bytes.subarray(0, CHARSET_SNIFF_BYTES));
  const match = /<meta[^>]*charset=["']?([^"'>\s;/]+)/i.exec(head);
  return match ? match[1].toLowerCase() : null;
}

function decodeWith(bytes: Uint8Array, charset: string): string | null {
  try {
    return new TextDecoder(charset, { fatal: true }).decode(bytes);
  } catch {
    // An unsupported label or a mismatched declaration is worth surviving.
    return null;
  }
}

/**
 * Kenyon's registrar serves the schedule as bare `text/html` with windows-1252
 * bytes, so assuming UTF-8 corrupts accented instructor names. Prefer a
 * declared charset, then well-formed UTF-8, and fall back to windows-1252 --
 * which decodes any byte sequence and so always terminates the chain.
 */
export function decodeSourceBytes(
  bytes: Uint8Array,
  contentType: string | null,
): string {
  const declared = charsetFromContentType(contentType) ?? charsetFromMetaTag(bytes);
  const declaredText = declared === null ? null : decodeWith(bytes, declared);
  if (declaredText !== null) return declaredText;

  return (
    decodeWith(bytes, "utf-8") ??
    new TextDecoder(FALLBACK_SOURCE_CHARSET).decode(bytes)
  );
}

function clockMinutes(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = /^(?:[01]\d|2[0-3]):[0-5]\d$/.exec(value);
  if (!match) return null;
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
}

export function validateCourseSnapshot(value: unknown): asserts value is CourseSnapshot {
  assertion(isObject(value), "Snapshot must be an object");
  assertion(value.schemaVersion === 1, "Snapshot schemaVersion must be 1");
  assertion(isObject(value.term), "Snapshot term must be an object");
  assertion(value.term.id === "fall-2026" && value.term.label === "Fall 2026", "Invalid term");
  assertion(typeof value.importedAt === "string" && !Number.isNaN(Date.parse(value.importedAt)), "Invalid importedAt");
  assertion(Array.isArray(value.sections) && value.sections.length > 0, "Snapshot must contain sections");

  const crns = new Set<string>();
  for (const section of value.sections) {
    assertion(isObject(section), "Each section must be an object");
    for (const field of ["crn", "subject", "catalogNumber", "sectionNumber", "courseCode", "title"] as const) {
      assertion(typeof section[field] === "string" && section[field].length > 0, `Invalid section ${field}`);
    }
    assertion(/^\d{5}$/.test(section.crn as string), `Invalid CRN ${section.crn}`);
    assertion(!crns.has(section.crn as string), `Duplicate CRN ${section.crn}`);
    crns.add(section.crn as string);
    assertion(
      section.courseCode === `${section.subject} ${section.catalogNumber}`,
      `Course code does not match subject and catalog number for CRN ${section.crn}`,
    );
    assertion(typeof section.credits === "number" && Number.isFinite(section.credits) && section.credits >= 0, `Invalid credits for CRN ${section.crn}`);
    assertion(Array.isArray(section.instructors) && section.instructors.length > 0 && section.instructors.every((name) => typeof name === "string" && name.length > 0), `Invalid instructors for CRN ${section.crn}`);
    assertion(Array.isArray(section.meetings), `Invalid meetings for CRN ${section.crn}`);
    assertion(section.meetingStatus === (section.meetings.length > 0 ? "scheduled" : "time-unavailable"), `Invalid meeting status for CRN ${section.crn}`);
    for (const meeting of section.meetings) {
      assertion(isObject(meeting), `Invalid meeting for CRN ${section.crn}`);
      assertion(Array.isArray(meeting.days) && meeting.days.length > 0 && meeting.days.every((day) => ["M", "T", "W", "R", "F"].includes(day)), `Invalid meeting days for CRN ${section.crn}`);
      const startMinutes = clockMinutes(meeting.startTime);
      const endMinutes = clockMinutes(meeting.endTime);
      assertion(startMinutes !== null, `Invalid start time for CRN ${section.crn}`);
      assertion(endMinutes !== null && endMinutes > startMinutes, `Invalid end time for CRN ${section.crn}`);
      assertion(typeof meeting.room === "string", `Invalid room for CRN ${section.crn}`);
    }
    assertion(isObject(section.prerequisite), `Invalid prerequisite for CRN ${section.crn}`);
    assertion(["known", "none", "unavailable"].includes(section.prerequisite.status as string), `Invalid prerequisite status for CRN ${section.crn}`);
    if (section.prerequisite.status !== "unavailable") {
      assertion(typeof section.prerequisite.text === "string" && section.prerequisite.text.length > 0, `Invalid prerequisite text for CRN ${section.crn}`);
      assertion(typeof section.prerequisite.sourceUrl === "string", `Invalid prerequisite source for CRN ${section.crn}`);
      assertApprovedSourceUrl(section.prerequisite.sourceUrl, "catalog");
    }
  }
}

export function validateImportReport(
  value: unknown,
  snapshot: CourseSnapshot,
  minimumSectionCount = FALL_2026_REVIEWED_MINIMUM_SECTION_COUNT,
): asserts value is ImportReport {
  positiveInteger(minimumSectionCount, "Fall 2026 minimum section count");
  assertion(isObject(value), "Import report must be an object");
  assertion(value.schemaVersion === 1 && value.term === "fall-2026", "Invalid import report identity");
  assertion(value.importedAt === snapshot.importedAt, "Snapshot and report timestamps differ");
  assertion(isObject(value.sources) && isObject(value.counts), "Import report metadata is missing");
  const sources = value.sources;
  assertion(isObject(sources.schedule), "Schedule source metadata is missing");
  assertion(sources.schedule.url === SCHEDULE_URL, "Unexpected schedule source URL");
  assertion(typeof sources.schedule.retrievedAt === "string" && !Number.isNaN(Date.parse(sources.schedule.retrievedAt)), "Invalid schedule retrieval timestamp");
  assertion(isObject(sources.catalogIndex), "Catalog index source metadata is missing");
  assertion(sources.catalogIndex.url === CATALOG_INDEX_URL, "Unexpected catalog index source URL");
  assertion(typeof sources.catalogIndex.retrievedAt === "string" && !Number.isNaN(Date.parse(sources.catalogIndex.retrievedAt)), "Invalid catalog index retrieval timestamp");
  assertion(Array.isArray(sources.catalogPages) && sources.catalogPages.length > 0, "Catalog page source metadata is missing");
  const catalogPageUrls = new Set<string>();
  for (const page of sources.catalogPages) {
    assertion(isObject(page), "Invalid catalog page source metadata");
    assertion(typeof page.url === "string", "Invalid catalog page URL");
    const catalogPageUrl = assertApprovedSourceUrl(page.url, "catalog");
    assertion(!catalogPageUrls.has(catalogPageUrl), `Duplicate catalog page URL ${catalogPageUrl}`);
    catalogPageUrls.add(catalogPageUrl);
    assertion(typeof page.retrievedAt === "string" && !Number.isNaN(Date.parse(page.retrievedAt)), "Invalid catalog page retrieval timestamp");
    assertion(Number.isInteger(page.courseCount) && (page.courseCount as number) >= 0, "Invalid catalog page course count");
  }
  assertion(isObject(value.counts.scheduleRows), "Schedule row counts are missing");
  const rowCounts = value.counts.scheduleRows;
  for (const key of ["total", "header", "section", "continuation", "divider", "summary"] as const) {
    assertion(Number.isInteger(rowCounts[key]) && (rowCounts[key] as number) >= 0, `Invalid schedule ${key} row count`);
  }
  const classified = ["header", "section", "continuation", "divider", "summary"].reduce(
    (sum, key) => sum + Number(rowCounts[key]),
    0,
  );
  assertion(classified === rowCounts.total, "Not every source schedule row was classified");
  assertion(rowCounts.section === snapshot.sections.length, "Schedule section row count differs from snapshot");
  assertion(value.counts.sections === snapshot.sections.length, "Report section count differs from snapshot");
  assertion(isObject(value.completeness), "Completeness metadata is missing");
  const completeness = value.completeness;
  for (const key of ["baseline", "actual", "delta", "tolerance"] as const) {
    assertion(Number.isInteger(completeness[key]), `Invalid completeness ${key}`);
  }
  assertion(
    completeness.baseline === minimumSectionCount,
    "Completeness baseline differs from the reviewed baseline",
  );
  assertion(
    completeness.actual === snapshot.sections.length,
    "Completeness section count differs from snapshot",
  );
  assertion(
    completeness.tolerance === sectionCountTolerance(minimumSectionCount),
    "Completeness tolerance differs from the reviewed tolerance",
  );
  assertion(
    completeness.delta === (completeness.actual as number) - (completeness.baseline as number),
    "Completeness delta is inconsistent with its baseline and count",
  );
  assertion(
    (completeness.delta as number) >= -(completeness.tolerance as number),
    `Fall 2026 snapshot contains ${snapshot.sections.length} sections, below the reviewed baseline of ${minimumSectionCount} and beyond the accepted tolerance of ${completeness.tolerance}`,
  );
  assertion(value.counts.catalogPages === sources.catalogPages.length, "Catalog page count differs from source records");
  const catalogCourseCount = sources.catalogPages.reduce(
    (sum, page) => sum + (page as Record<string, unknown>).courseCount as number,
    0,
  );
  assertion(value.counts.catalogCourses === catalogCourseCount, "Catalog course count differs from source records");
  assertion(isObject(value.counts.prerequisites), "Prerequisite counts are missing");
  const prerequisites = value.counts.prerequisites;
  const actualPrerequisites = snapshot.sections.reduce(
    (counts, section) => ({ ...counts, [section.prerequisite.status]: counts[section.prerequisite.status] + 1 }),
    { known: 0, none: 0, unavailable: 0 },
  );
  for (const status of ["known", "none", "unavailable"] as const) {
    assertion(prerequisites[status] === actualPrerequisites[status], `Prerequisite ${status} count differs from snapshot`);
  }
  for (const section of snapshot.sections) {
    if (section.prerequisite.status === "unavailable") continue;
    assertion(
      catalogPageUrls.has(new URL(section.prerequisite.sourceUrl).href),
      `Prerequisite source for CRN ${section.crn} is absent from fetched catalog pages`,
    );
  }
  assertion(Array.isArray(value.unmatchedPrerequisites), "Unmatched prerequisite records are missing");
  assertion(value.unmatchedPrerequisites.length === actualPrerequisites.unavailable, "Unmatched prerequisite count differs from snapshot");
  const unavailableCrns = new Set(
    snapshot.sections
      .filter((section) => section.prerequisite.status === "unavailable")
      .map((section) => section.crn),
  );
  const sectionsByCrn = new Map(snapshot.sections.map((section) => [section.crn, section]));
  const unmatchedCrns = new Set<string>();
  for (const record of value.unmatchedPrerequisites) {
    assertion(isObject(record), "Invalid unmatched prerequisite record");
    assertion(typeof record.crn === "string" && unavailableCrns.has(record.crn), `Unexpected unmatched prerequisite CRN ${record.crn}`);
    assertion(!unmatchedCrns.has(record.crn), `Duplicate unmatched prerequisite CRN ${record.crn}`);
    unmatchedCrns.add(record.crn);
    assertion(typeof record.courseCode === "string" && typeof record.title === "string", `Invalid unmatched prerequisite record for CRN ${record.crn}`);
    const referencedSection = sectionsByCrn.get(record.crn);
    assertion(
      referencedSection !== undefined &&
        record.courseCode === referencedSection.courseCode &&
        record.title === referencedSection.title,
      `Unmatched prerequisite identity differs from section for CRN ${record.crn}`,
    );
    assertion(["catalog-course-not-found", "catalog-prerequisite-unavailable", "special-topic"].includes(record.reason as string), `Invalid unmatched prerequisite reason for CRN ${record.crn}`);
  }
}

async function fetchTextOnce(
  policy: FetchPolicy,
  url: string,
  kind: SourceKind,
): Promise<string> {
  const { fetchImpl, requestTimeoutMs } = policy;
  const approvedUrl = assertApprovedSourceUrl(url, kind);
  const controller = new AbortController();
  let timedOut = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(
        new TransientSourceError(
          `Request timed out after ${requestTimeoutMs}ms: ${approvedUrl}`,
        ),
      );
    }, requestTimeoutMs);
  });

  try {
    let requestUrl = approvedUrl;
    for (let redirectCount = 0; ; redirectCount += 1) {
      const response = await Promise.race([
        fetchImpl(requestUrl, {
          redirect: "manual",
          signal: controller.signal,
          headers: { "user-agent": SOURCE_USER_AGENT },
        }),
        timeoutPromise,
      ]);
      if (response.status >= 300 && response.status < 400) {
        if (redirectCount >= MAXIMUM_SOURCE_REDIRECTS) {
          throw new Error(
            `Source request exceeded redirect limit ${MAXIMUM_SOURCE_REDIRECTS}: ${approvedUrl}`,
          );
        }
        const location = response.headers.get("location");
        if (!location) {
          throw new Error(`Source redirect is missing a Location header: ${requestUrl}`);
        }
        requestUrl = assertApprovedSourceUrl(
          new URL(location, requestUrl).href,
          kind,
        );
        continue;
      }
      if (!response.ok) {
        const failure = `Failed to fetch ${requestUrl}: HTTP ${response.status}`;
        // A 404 or 403 is a structural signal the pipeline should surface, not
        // paper over with retries. Only 429 and 5xx are worth another attempt.
        throw isRetryableStatus(response.status)
          ? new TransientSourceError(failure)
          : new Error(failure);
      }
      assertApprovedSourceUrl(response.url, kind, true);
      const bytes = new Uint8Array(await response.arrayBuffer());
      return decodeSourceBytes(bytes, response.headers.get("content-type"));
    }
  } catch (error) {
    if (
      timedOut ||
      (error instanceof DOMException && error.name === "AbortError")
    ) {
      throw new TransientSourceError(
        `Request timed out after ${requestTimeoutMs}ms: ${approvedUrl}`,
      );
    }
    if (error instanceof TypeError) {
      // `fetch` reports connection-level failures as TypeError.
      throw new TransientSourceError(
        `Source request failed to connect: ${approvedUrl} (${error.message})`,
      );
    }
    throw error;
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

async function fetchText(
  policy: FetchPolicy,
  url: string,
  kind: SourceKind,
): Promise<string> {
  let lastTransient: TransientSourceError | undefined;

  for (let attempt = 1; attempt <= policy.maximumAttempts; attempt += 1) {
    try {
      return await policy.runRequest(() => fetchTextOnce(policy, url, kind));
    } catch (error) {
      if (!(error instanceof TransientSourceError)) throw error;
      lastTransient = error;
      if (attempt >= policy.maximumAttempts) break;
      await policy.sleep(policy.retryBaseDelayMs * 2 ** (attempt - 1));
    }
  }

  throw new Error(
    `${lastTransient?.message ?? "Source request failed"} (after ${policy.maximumAttempts} attempts)`,
  );
}

function buildCatalogMap(courses: CatalogCourse[]): Map<string, CatalogCourse> {
  const catalog = new Map<string, CatalogCourse>();
  for (const course of courses) {
    const existing = catalog.get(course.matchKey);
    if (existing) {
      const sameStatus = existing.prerequisite.status === course.prerequisite.status;
      const existingText = existing.prerequisite.status === "unavailable" ? undefined : existing.prerequisite.text;
      const courseText = course.prerequisite.status === "unavailable" ? undefined : course.prerequisite.text;
      if (!sameStatus || existingText !== courseText) {
        throw new Error(`Conflicting catalog records for ${course.courseCode}`);
      }
      continue;
    }
    catalog.set(course.matchKey, course);
  }
  return catalog;
}

interface FetchedCatalogPage {
  url: string;
  retrievedAt: string;
  courses: CatalogCourse[];
}

interface CatalogTraversal {
  visited: Set<string>;
  maximumDepth: number;
  maximumPages: number;
  policy: FetchPolicy;
}

async function fetchCatalogBranch(
  url: string,
  now: () => Date,
  traversal: CatalogTraversal,
  depth = 0,
  ancestors: ReadonlySet<string> = new Set(),
): Promise<FetchedCatalogPage[]> {
  const approvedUrl = assertApprovedSourceUrl(url, "catalog");
  if (depth > traversal.maximumDepth) {
    throw new Error(
      `Catalog discovery exceeded depth limit ${traversal.maximumDepth} at ${approvedUrl}`,
    );
  }
  if (ancestors.has(approvedUrl)) {
    throw new Error(`Catalog discovery cycle detected at ${approvedUrl}`);
  }
  if (traversal.visited.has(approvedUrl)) return [];
  if (traversal.visited.size >= traversal.maximumPages) {
    throw new Error(
      `Catalog discovery exceeded page limit ${traversal.maximumPages} at ${approvedUrl}`,
    );
  }
  traversal.visited.add(approvedUrl);

  const html = await fetchText(traversal.policy, approvedUrl, "catalog");
  const retrievedAt = now().toISOString();
  try {
    return [
      {
        url: approvedUrl,
        retrievedAt,
        courses: parseCatalogCoursePage(html, approvedUrl),
      },
    ];
  } catch (error) {
    if (!(error instanceof CatalogStructureError)) throw error;
    const subpageUrls = parseCatalogSubpageLinks(html, approvedUrl);
    if (subpageUrls.length === 0) throw error;
    const nextAncestors = new Set(ancestors).add(approvedUrl);
    const children = await Promise.all(
      subpageUrls.map((subpageUrl) =>
        fetchCatalogBranch(subpageUrl, now, traversal, depth + 1, nextAncestors),
      ),
    );
    return [{ url: approvedUrl, retrievedAt, courses: [] }, ...children.flat()];
  }
}

function classifyPrerequisite(
  section: CourseSection,
  catalog: Map<string, CatalogCourse>,
): { prerequisite: Prerequisite; reason?: ImportReport["unmatchedPrerequisites"][number]["reason"] } {
  if (/^ST\s*:/i.test(section.title)) {
    return { prerequisite: { status: "unavailable" }, reason: "special-topic" };
  }
  const course = catalog.get(normalizeCourseKey(section.courseCode));
  if (!course) {
    return { prerequisite: { status: "unavailable" }, reason: "catalog-course-not-found" };
  }
  if (course.prerequisite.status === "unavailable") {
    return { prerequisite: course.prerequisite, reason: "catalog-prerequisite-unavailable" };
  }
  return { prerequisite: course.prerequisite };
}

async function replaceArtifacts(
  snapshotPath: string,
  reportPath: string,
  snapshot: CourseSnapshot,
  report: ImportReport,
  renameFile: typeof rename,
  minimumSectionCount: number,
): Promise<void> {
  assertion(path.dirname(snapshotPath) === path.dirname(reportPath), "Snapshot and report must share an output directory");
  const outputDirectory = path.dirname(snapshotPath);
  await mkdir(outputDirectory, { recursive: true });
  const readPreviousArtifact = async (artifactPath: string): Promise<Buffer | null> => {
    try {
      return await readFile(artifactPath);
    } catch (error) {
      if (isObject(error) && error.code === "ENOENT") return null;
      throw error;
    }
  };
  const restoreArtifact = async (artifactPath: string, previous: Buffer | null): Promise<void> => {
    if (previous === null) {
      await rm(artifactPath, { force: true });
    } else {
      await writeFile(artifactPath, previous);
    }
  };
  const [previousSnapshot, previousReport] = await Promise.all([
    readPreviousArtifact(snapshotPath),
    readPreviousArtifact(reportPath),
  ]);
  const temporaryDirectory = await mkdtemp(path.join(outputDirectory, ".fall-2026-import-"));
  const nextSnapshot = path.join(temporaryDirectory, path.basename(snapshotPath));
  const nextReport = path.join(temporaryDirectory, path.basename(reportPath));
  try {
    await Promise.all([
      writeFile(nextSnapshot, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8"),
      writeFile(nextReport, `${JSON.stringify(report, null, 2)}\n`, "utf8"),
    ]);
    const [writtenSnapshot, writtenReport] = await Promise.all([
      readFile(nextSnapshot, "utf8").then(JSON.parse),
      readFile(nextReport, "utf8").then(JSON.parse),
    ]);
    validateCourseSnapshot(writtenSnapshot);
    validateImportReport(writtenReport, writtenSnapshot, minimumSectionCount);
    try {
      await renameFile(nextSnapshot, snapshotPath);
      await renameFile(nextReport, reportPath);
    } catch (commitError) {
      const rollback = await Promise.allSettled([
        restoreArtifact(snapshotPath, previousSnapshot),
        restoreArtifact(reportPath, previousReport),
      ]);
      const rollbackErrors = rollback.flatMap((result) =>
        result.status === "rejected" ? [result.reason] : [],
      );
      if (rollbackErrors.length > 0) {
        throw new AggregateError(
          [commitError, ...rollbackErrors],
          "Artifact commit failed and rollback could not restore both previous files",
        );
      }
      throw commitError;
    }
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

export async function importFall2026(options: ImportOptions = {}): Promise<{ snapshot: CourseSnapshot; report: ImportReport }> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => new Date());
  const snapshotPath = options.snapshotPath ?? path.join(process.cwd(), "src/data/fall-2026.json");
  const reportPath = options.reportPath ?? path.join(process.cwd(), "src/data/fall-2026.import-report.json");
  const minimumSectionCount = positiveInteger(
    options.minimumSectionCount ?? minimumSectionCountFromEnvironment(),
    "Fall 2026 minimum section count",
  );
  const maximumCatalogDepth = nonNegativeInteger(
    options.maximumCatalogDepth ?? DEFAULT_MAXIMUM_CATALOG_DEPTH,
    "Maximum catalog depth",
  );
  const maximumCatalogPages = positiveInteger(
    options.maximumCatalogPages ?? DEFAULT_MAXIMUM_CATALOG_PAGES,
    "Maximum catalog pages",
  );
  const requestTimeoutMs = positiveInteger(
    options.requestTimeoutMs ?? DEFAULT_SOURCE_REQUEST_TIMEOUT_MS,
    "Source request timeout",
  );
  const policy: FetchPolicy = {
    fetchImpl,
    requestTimeoutMs,
    maximumAttempts: positiveInteger(
      options.maximumAttempts ?? DEFAULT_MAXIMUM_ATTEMPTS,
      "Maximum source request attempts",
    ),
    retryBaseDelayMs: positiveInteger(
      options.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS,
      "Retry base delay",
    ),
    sleep:
      options.sleep ??
      ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))),
    runRequest: createRequestLimiter(
      positiveInteger(
        options.catalogConcurrency ?? DEFAULT_CATALOG_CONCURRENCY,
        "Catalog concurrency",
      ),
    ),
  };

  const scheduleHtml = await fetchText(policy, SCHEDULE_URL, "schedule");
  const scheduleRetrievedAt = now().toISOString();
  const parsedSchedule = parseScheduleHtml(scheduleHtml);
  const completeness = assertFall2026ScheduleCompleteness(
    parsedSchedule,
    minimumSectionCount,
  );
  const catalogIndexHtml = await fetchText(policy, CATALOG_INDEX_URL, "catalog");
  const catalogIndexRetrievedAt = now().toISOString();
  const catalogUrls = parseCatalogIndexHtml(catalogIndexHtml, CATALOG_INDEX_URL);
  const traversal: CatalogTraversal = {
    visited: new Set(),
    maximumDepth: maximumCatalogDepth,
    maximumPages: maximumCatalogPages,
    policy,
  };
  const catalogPages = (
    await Promise.all(
      catalogUrls.map((url) => fetchCatalogBranch(url, now, traversal)),
    )
  ).flat();
  const catalogCourses = catalogPages.flatMap(({ courses }) => courses);
  const catalog = buildCatalogMap(catalogCourses);
  const unmatchedPrerequisites: ImportReport["unmatchedPrerequisites"] = [];
  const sections: CourseSection[] = parsedSchedule.sections.map((scheduleSection) => {
    const provisional = { ...scheduleSection, prerequisite: { status: "unavailable" } } as CourseSection;
    const classification = classifyPrerequisite(provisional, catalog);
    if (classification.reason) {
      unmatchedPrerequisites.push({
        crn: scheduleSection.crn,
        courseCode: scheduleSection.courseCode,
        title: scheduleSection.title,
        reason: classification.reason,
      });
    }
    return { ...scheduleSection, prerequisite: classification.prerequisite };
  });
  const importedAt = now().toISOString();
  const snapshot: CourseSnapshot = {
    schemaVersion: 1,
    term: { id: "fall-2026", label: "Fall 2026" },
    importedAt,
    sections,
  };
  const prerequisiteCounts = sections.reduce(
    (counts, section) => ({ ...counts, [section.prerequisite.status]: counts[section.prerequisite.status] + 1 }),
    { known: 0, none: 0, unavailable: 0 },
  );
  const report: ImportReport = {
    schemaVersion: 1,
    term: "fall-2026",
    importedAt,
    sources: {
      schedule: { url: SCHEDULE_URL, retrievedAt: scheduleRetrievedAt },
      catalogIndex: { url: CATALOG_INDEX_URL, retrievedAt: catalogIndexRetrievedAt },
      catalogPages: catalogPages.map(({ url, retrievedAt, courses }) => ({
        url,
        retrievedAt,
        courseCount: courses.length,
      })),
    },
    counts: {
      scheduleRows: parsedSchedule.rowCounts,
      catalogPages: catalogPages.length,
      catalogCourses: catalogCourses.length,
      sections: sections.length,
      prerequisites: prerequisiteCounts,
    },
    completeness,
    unmatchedPrerequisites,
  };

  validateCourseSnapshot(snapshot);
  validateImportReport(report, snapshot, minimumSectionCount);
  await replaceArtifacts(
    snapshotPath,
    reportPath,
    snapshot,
    report,
    options.renameFile ?? rename,
    minimumSectionCount,
  );
  return { snapshot, report };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  importFall2026()
    .then(({ report }) => {
      console.log(
        `Imported ${report.counts.sections} Fall 2026 sections from ${report.counts.scheduleRows.total} classified schedule rows.`,
      );
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
