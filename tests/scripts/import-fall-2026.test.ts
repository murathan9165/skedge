import { mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  CATALOG_INDEX_URL,
  SCHEDULE_URL,
  importFall2026,
} from "../../scripts/courses/import-fall-2026";
import { verifyFall2026Data } from "../../scripts/courses/verify-fall-2026";
import type { CourseSnapshot, ImportReport } from "../../src/lib/courses/types";

const catalogUrl = "https://www.kenyon.edu/catalog/amst/";
const FIXTURE_SECTION_COUNT = 4;
const fixtureDirectory = path.join(process.cwd(), "tests/fixtures/kenyon");
const temporaryDirectories: string[] = [];

async function fixtures() {
  return {
    schedule: await readFile(path.join(fixtureDirectory, "fall-2026-schedule.html"), "utf8"),
    catalog: await readFile(path.join(fixtureDirectory, "catalog-course-page.html"), "utf8"),
  };
}

async function windows1252ScheduleBytes(): Promise<Buffer> {
  return readFile(path.join(fixtureDirectory, "fall-2026-schedule-windows-1252.html"));
}

function catalogIndex(): string {
  return `<li class="reference_nav_item"><div class="reference_nav_item_inner"><a href="${CATALOG_INDEX_URL}">Course Offerings</a></div><ul class="reference_nav_children"><li><a class="reference_nav_child_link" href="${catalogUrl}">American Studies</a></li></ul></li>`;
}

function responseFrom(
  body: string,
  url: string,
  status = 200,
  headers?: HeadersInit,
): Response {
  const response = new Response(body, { status, headers });
  Object.defineProperty(response, "url", { value: url });
  return response;
}

function bytesResponseFrom(
  body: Uint8Array,
  url: string,
  headers?: HeadersInit,
): Response {
  // Copy into a plain ArrayBuffer so the body is a valid BodyInit regardless of
  // whether the caller passed a Buffer or a Uint8Array view.
  const buffer = new ArrayBuffer(body.byteLength);
  new Uint8Array(buffer).set(body);
  const response = new Response(buffer, { status: 200, headers });
  Object.defineProperty(response, "url", { value: url });
  return response;
}

/**
 * Serves the schedule URL as raw bytes so the importer's decoding path is
 * exercised. Every other URL falls through to the string-bodied fixtures.
 */
function fetchWithRawSchedule(
  scheduleBody: Uint8Array,
  rest: Record<string, string>,
  scheduleHeaders?: HeadersInit,
): typeof fetch {
  const fallback = fetchFrom(rest);
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : input.toString();
    if (url === SCHEDULE_URL) {
      return bytesResponseFrom(scheduleBody, url, scheduleHeaders);
    }
    return fallback(input, init);
  }) as typeof fetch;
}

function fetchFrom(values: Record<string, string>): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = input instanceof Request ? input.url : input.toString();
    const body = values[url];
    return body === undefined
      ? responseFrom("missing fixture", url, 404)
      : responseFrom(body, url);
  }) as typeof fetch;
}

async function outputPaths() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "kenyon-import-test-"));
  temporaryDirectories.push(directory);
  return {
    snapshotPath: path.join(directory, "fall-2026.json"),
    reportPath: path.join(directory, "fall-2026.import-report.json"),
  };
}

async function seedPreviousArtifacts(paths: Awaited<ReturnType<typeof outputPaths>>) {
  await writeFile(paths.snapshotPath, "previous snapshot\n");
  await writeFile(paths.reportPath, "previous report\n");
}

async function expectPreviousArtifacts(paths: Awaited<ReturnType<typeof outputPaths>>) {
  expect(await readFile(paths.snapshotPath, "utf8")).toBe("previous snapshot\n");
  expect(await readFile(paths.reportPath, "utf8")).toBe("previous report\n");
}

function oneSectionSchedule(schedule: string): string {
  const rows = schedule
    .split("\n")
    .filter(
      (line) =>
        line.startsWith("CRN   SUBJ") ||
        line.startsWith("----- ----") ||
        line.startsWith("80565 "),
    );
  return `<pre>\n${rows.join("\n")}\n</pre>`;
}

async function importedFixtureArtifacts() {
  const source = await fixtures();
  const paths = await outputPaths();
  await importFall2026({
    ...paths,
    minimumSectionCount: FIXTURE_SECTION_COUNT,
    fetchImpl: fetchFrom({
      [SCHEDULE_URL]: source.schedule,
      [CATALOG_INDEX_URL]: catalogIndex(),
      [catalogUrl]: source.catalog,
    }),
    now: () => new Date("2026-08-04T19:00:00.000Z"),
  });
  return paths;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe("importFall2026", () => {
  it("builds validated snapshot and report artifacts from fetched source fixtures", async () => {
    const source = await fixtures();
    const paths = await outputPaths();
    await importFall2026({
      ...paths,
      minimumSectionCount: FIXTURE_SECTION_COUNT,
      fetchImpl: fetchFrom({
        [SCHEDULE_URL]: source.schedule,
        [CATALOG_INDEX_URL]: catalogIndex(),
        [catalogUrl]: source.catalog,
      }),
      now: () => new Date("2026-08-04T19:00:00.000Z"),
    });

    const snapshot = JSON.parse(await readFile(paths.snapshotPath, "utf8")) as CourseSnapshot;
    const report = JSON.parse(await readFile(paths.reportPath, "utf8")) as ImportReport;
    expect(snapshot.sections).toHaveLength(4);
    expect(snapshot.sections.find(({ crn }) => crn === "80565")?.prerequisite).toEqual({
      status: "none",
      text: "No prerequisite.",
      sourceUrl: catalogUrl,
    });
    expect(snapshot.sections.find(({ crn }) => crn === "80116")?.prerequisite).toEqual({
      status: "unavailable",
    });
    expect(report).toMatchObject({
      importedAt: "2026-08-04T19:00:00.000Z",
      sources: {
        schedule: { url: SCHEDULE_URL, retrievedAt: "2026-08-04T19:00:00.000Z" },
        catalogIndex: { url: CATALOG_INDEX_URL, retrievedAt: "2026-08-04T19:00:00.000Z" },
      },
      counts: {
        sections: 4,
        prerequisites: { known: 0, none: 1, unavailable: 3 },
      },
      completeness: {
        baseline: FIXTURE_SECTION_COUNT,
        actual: 4,
        delta: 0,
        tolerance: 15,
      },
    });
    expect(report.unmatchedPrerequisites).toHaveLength(3);
  });

  it("rejects an HTTP 200 schedule below the reviewed Fall 2026 completeness baseline", async () => {
    const source = await fixtures();
    const paths = await outputPaths();
    await seedPreviousArtifacts(paths);

    await expect(
      importFall2026({
        ...paths,
        fetchImpl: fetchFrom({
          [SCHEDULE_URL]: oneSectionSchedule(source.schedule),
          [CATALOG_INDEX_URL]: catalogIndex(),
          [catalogUrl]: source.catalog,
        }),
      }),
    ).rejects.toThrow(/below.*reviewed.*629/i);
    await expectPreviousArtifacts(paths);
  });

  it("allows an explicit maintenance completeness override", async () => {
    const source = await fixtures();
    const paths = await outputPaths();

    const { report } = await importFall2026({
      ...paths,
      minimumSectionCount: 1,
      fetchImpl: fetchFrom({
        [SCHEDULE_URL]: oneSectionSchedule(source.schedule),
        [CATALOG_INDEX_URL]: catalogIndex(),
        [catalogUrl]: source.catalog,
      }),
      now: () => new Date("2026-08-04T19:00:00.000Z"),
    });

    expect(report.counts.sections).toBe(1);
  });

  it("rejects an off-origin final response URL after redirect and preserves artifacts", async () => {
    const source = await fixtures();
    const paths = await outputPaths();
    await seedPreviousArtifacts(paths);
    const normalFetch = fetchFrom({
      [CATALOG_INDEX_URL]: catalogIndex(),
      [catalogUrl]: source.catalog,
    });
    const redirectedFetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : input.toString();
      if (url === SCHEDULE_URL) {
        return responseFrom(source.schedule, "https://attacker.example/fall-2026.html");
      }
      return normalFetch(input, init);
    }) as typeof fetch;

    await expect(
      importFall2026({
        ...paths,
        minimumSectionCount: FIXTURE_SECTION_COUNT,
        fetchImpl: redirectedFetch,
      }),
    ).rejects.toThrow(/final.*approved.*registrar\.kenyon\.edu/i);
    await expectPreviousArtifacts(paths);
  });

  it("rejects an off-origin redirect before requesting its destination", async () => {
    const source = await fixtures();
    const paths = await outputPaths();
    await seedPreviousArtifacts(paths);
    const untrustedUrl = "https://attacker.example/fall-2026.html";
    const requestedUrls: string[] = [];
    const redirectingFetch = (async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      const url = input instanceof Request ? input.url : input.toString();
      requestedUrls.push(url);
      if (url !== SCHEDULE_URL) {
        return responseFrom("unexpected request", url, 500);
      }
      if (init?.redirect === "follow") {
        requestedUrls.push(untrustedUrl);
        return responseFrom(source.schedule, untrustedUrl);
      }
      return responseFrom("", SCHEDULE_URL, 302, { location: untrustedUrl });
    }) as typeof fetch;

    await expect(
      importFall2026({
        ...paths,
        minimumSectionCount: FIXTURE_SECTION_COUNT,
        fetchImpl: redirectingFetch,
      }),
    ).rejects.toThrow(/approved.*schedule.*registrar\.kenyon\.edu/i);
    expect(requestedUrls).toEqual([SCHEDULE_URL]);
    await expectPreviousArtifacts(paths);
  });

  it.each(["index", "nested"] as const)(
    "rejects an off-origin %s catalog discovery and preserves artifacts",
    async (discoveryKind) => {
      const source = await fixtures();
      const paths = await outputPaths();
      await seedPreviousArtifacts(paths);
      const umbrellaUrl = "https://www.kenyon.edu/catalog/umbrella/";
      const untrustedUrl = "https://attacker.example/catalog/courses/";
      const indexHtml =
        discoveryKind === "index"
          ? catalogIndex().replaceAll(catalogUrl, untrustedUrl)
          : catalogIndex().replaceAll(catalogUrl, umbrellaUrl);
      const values = {
        [SCHEDULE_URL]: source.schedule,
        [CATALOG_INDEX_URL]: indexHtml,
        [umbrellaUrl]: `<nav><a class="sub_nav_link" href="${untrustedUrl}">Courses in Drama</a></nav>`,
        [untrustedUrl]: source.catalog,
      };

      await expect(
        importFall2026({
          ...paths,
          minimumSectionCount: FIXTURE_SECTION_COUNT,
          fetchImpl: fetchFrom(values),
        }),
      ).rejects.toThrow(/approved.*catalog.*www\.kenyon\.edu/i);
      await expectPreviousArtifacts(paths);
    },
  );

  it("rejects a catalog discovery cycle and preserves artifacts", async () => {
    const source = await fixtures();
    const paths = await outputPaths();
    await seedPreviousArtifacts(paths);
    const firstUrl = "https://www.kenyon.edu/catalog/first/";
    const secondUrl = "https://www.kenyon.edu/catalog/second/";
    const values = {
      [SCHEDULE_URL]: source.schedule,
      [CATALOG_INDEX_URL]: catalogIndex().replaceAll(catalogUrl, firstUrl),
      [firstUrl]: `<nav><a class="sub_nav_link" href="${secondUrl}">Courses in Drama</a></nav>`,
      [secondUrl]: `<nav><a class="sub_nav_link" href="${firstUrl}">Courses in Dance</a></nav>`,
    };
    const fixtureFetch = fetchFrom(values);
    let catalogRequests = 0;
    const boundedCycleFetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : input.toString();
      if (url === firstUrl || url === secondUrl) {
        catalogRequests += 1;
        if (catalogRequests > 4) return responseFrom("cycle guard", url, 500);
      }
      return fixtureFetch(input, init);
    }) as typeof fetch;

    await expect(
      importFall2026({
        ...paths,
        minimumSectionCount: FIXTURE_SECTION_COUNT,
        fetchImpl: boundedCycleFetch,
      }),
    ).rejects.toThrow(/catalog.*cycle/i);
    await expectPreviousArtifacts(paths);
  });

  it("rejects catalog discovery beyond the configured page bound", async () => {
    const source = await fixtures();
    const paths = await outputPaths();
    await seedPreviousArtifacts(paths);
    const pageUrls = [
      "https://www.kenyon.edu/catalog/one/",
      "https://www.kenyon.edu/catalog/two/",
      "https://www.kenyon.edu/catalog/three/",
    ];
    const indexHtml = catalogIndex().replace(
      `<li><a class="reference_nav_child_link" href="${catalogUrl}">American Studies</a></li>`,
      pageUrls
        .map(
          (url, index) =>
            `<li><a class="reference_nav_child_link" href="${url}">Department ${index}</a></li>`,
        )
        .join(""),
    );

    await expect(
      importFall2026({
        ...paths,
        minimumSectionCount: FIXTURE_SECTION_COUNT,
        maximumCatalogPages: 2,
        fetchImpl: fetchFrom({
          [SCHEDULE_URL]: source.schedule,
          [CATALOG_INDEX_URL]: indexHtml,
          [pageUrls[0]]: source.catalog,
          [pageUrls[1]]: source.catalog,
          [pageUrls[2]]: source.catalog,
        }),
      }),
    ).rejects.toThrow(/catalog.*page limit.*2/i);
    await expectPreviousArtifacts(paths);
  });

  it("rejects catalog discovery beyond the configured depth bound", async () => {
    const source = await fixtures();
    const paths = await outputPaths();
    await seedPreviousArtifacts(paths);
    const firstUrl = "https://www.kenyon.edu/catalog/depth-one/";
    const secondUrl = "https://www.kenyon.edu/catalog/depth-two/";
    const thirdUrl = "https://www.kenyon.edu/catalog/depth-three/";

    await expect(
      importFall2026({
        ...paths,
        minimumSectionCount: FIXTURE_SECTION_COUNT,
        maximumCatalogDepth: 1,
        fetchImpl: fetchFrom({
          [SCHEDULE_URL]: source.schedule,
          [CATALOG_INDEX_URL]: catalogIndex().replaceAll(catalogUrl, firstUrl),
          [firstUrl]: `<nav><a class="sub_nav_link" href="${secondUrl}">Courses in Drama</a></nav>`,
          [secondUrl]: `<nav><a class="sub_nav_link" href="${thirdUrl}">Courses in Dance</a></nav>`,
          [thirdUrl]: source.catalog,
        }),
      }),
    ).rejects.toThrow(/catalog.*depth limit.*1/i);
    await expectPreviousArtifacts(paths);
  });

  it("times out a hung approved source request and preserves artifacts", async () => {
    const source = await fixtures();
    const paths = await outputPaths();
    await seedPreviousArtifacts(paths);
    const normalFetch = fetchFrom({
      [SCHEDULE_URL]: source.schedule,
      [CATALOG_INDEX_URL]: catalogIndex(),
    });
    const hungFetch = ((input: string | URL | Request, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : input.toString();
      if (url !== catalogUrl) return normalFetch(input, init);

      return new Promise<Response>((_, reject) => {
        if (init?.signal) {
          init.signal.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        } else {
          setTimeout(() => reject(new Error("request did not receive an abort signal")), 25);
        }
      });
    }) as typeof fetch;

    await expect(
      importFall2026({
        ...paths,
        minimumSectionCount: FIXTURE_SECTION_COUNT,
        requestTimeoutMs: 5,
        fetchImpl: hungFetch,
      }),
    ).rejects.toThrow(/timed out.*catalog\/amst/i);
    await expectPreviousArtifacts(paths);
  });

  it("keeps a special-topic prerequisite unavailable even when a generic catalog code exists", async () => {
    const source = await fixtures();
    const paths = await outputPaths();
    const specialTopicSchedule = source.schedule
      .replace("AMST 140.00", "AMST 291.00")
      .replace("Prisons, Policing, &amp; Amer Cult", "ST: Black Masculinities       ");
    const specialTopicCatalog = source.catalog.replace("AMST 140", "AMST 291");
    await importFall2026({
      ...paths,
      minimumSectionCount: FIXTURE_SECTION_COUNT,
      fetchImpl: fetchFrom({
        [SCHEDULE_URL]: specialTopicSchedule,
        [CATALOG_INDEX_URL]: catalogIndex(),
        [catalogUrl]: specialTopicCatalog,
      }),
      now: () => new Date("2026-08-04T19:00:00.000Z"),
    });

    const snapshot = JSON.parse(await readFile(paths.snapshotPath, "utf8")) as CourseSnapshot;
    const report = JSON.parse(await readFile(paths.reportPath, "utf8")) as ImportReport;
    expect(snapshot.sections[0].prerequisite).toEqual({ status: "unavailable" });
    expect(report.unmatchedPrerequisites[0].reason).toBe("special-topic");
  });

  it("follows course-description links from a catalog umbrella page", async () => {
    const source = await fixtures();
    const paths = await outputPaths();
    const umbrellaUrl = "https://www.kenyon.edu/catalog/ddf/";
    const childUrl = "https://www.kenyon.edu/catalog/ddf/courses/";
    const umbrellaIndex = catalogIndex().replaceAll(catalogUrl, umbrellaUrl);
    const umbrella = `<nav><a class="sub_nav_link" href="${childUrl}">Courses in Dance</a></nav>`;
    const { report } = await importFall2026({
      ...paths,
      minimumSectionCount: FIXTURE_SECTION_COUNT,
      fetchImpl: fetchFrom({
        [SCHEDULE_URL]: source.schedule,
        [CATALOG_INDEX_URL]: umbrellaIndex,
        [umbrellaUrl]: umbrella,
        [childUrl]: source.catalog,
      }),
      now: () => new Date("2026-08-04T19:00:00.000Z"),
    });

    expect(report.counts.catalogPages).toBe(2);
    expect(report.sources.catalogPages.map(({ url }) => url)).toEqual([umbrellaUrl, childUrl]);
  });

  it("preserves both previous artifacts when a source request fails", async () => {
    const source = await fixtures();
    const paths = await outputPaths();
    await seedPreviousArtifacts(paths);

    await expect(
      importFall2026({
        ...paths,
        minimumSectionCount: FIXTURE_SECTION_COUNT,
        fetchImpl: fetchFrom({
          [SCHEDULE_URL]: source.schedule,
          [CATALOG_INDEX_URL]: catalogIndex(),
        }),
      }),
    ).rejects.toThrow(/failed to fetch.*catalog\/amst/i);
    await expectPreviousArtifacts(paths);
  });

  it("preserves both previous artifacts when fetched HTML no longer matches", async () => {
    const source = await fixtures();
    const paths = await outputPaths();
    await seedPreviousArtifacts(paths);

    await expect(
      importFall2026({
        ...paths,
        minimumSectionCount: FIXTURE_SECTION_COUNT,
        fetchImpl: fetchFrom({
          [SCHEDULE_URL]: source.schedule,
          [CATALOG_INDEX_URL]: catalogIndex(),
          [catalogUrl]: "<html><h1>Changed page</h1></html>",
        }),
      }),
    ).rejects.toThrow(/expected catalog course structure/i);
    await expectPreviousArtifacts(paths);
  });

  it("rolls back both previous artifacts when the second commit rename fails", async () => {
    const source = await fixtures();
    const paths = await outputPaths();
    const previousSnapshot = Buffer.from("previous snapshot bytes\n");
    const previousReport = Buffer.from("previous report bytes\n");
    await writeFile(paths.snapshotPath, previousSnapshot);
    await writeFile(paths.reportPath, previousReport);
    let commitRenames = 0;

    await expect(
      importFall2026({
        ...paths,
        minimumSectionCount: FIXTURE_SECTION_COUNT,
        fetchImpl: fetchFrom({
          [SCHEDULE_URL]: source.schedule,
          [CATALOG_INDEX_URL]: catalogIndex(),
          [catalogUrl]: source.catalog,
        }),
        renameFile: async (sourcePath, destinationPath) => {
          commitRenames += 1;
          if (commitRenames === 2) throw new Error("injected report commit failure");
          await rename(sourcePath, destinationPath);
        },
      }),
    ).rejects.toThrow(/injected report commit failure/i);
    expect(await readFile(paths.snapshotPath)).toEqual(previousSnapshot);
    expect(await readFile(paths.reportPath)).toEqual(previousReport);
  });

  it("verifies committed artifacts without using the network", async () => {
    const source = await fixtures();
    const paths = await outputPaths();
    await importFall2026({
      ...paths,
      minimumSectionCount: FIXTURE_SECTION_COUNT,
      fetchImpl: fetchFrom({
        [SCHEDULE_URL]: source.schedule,
        [CATALOG_INDEX_URL]: catalogIndex(),
        [catalogUrl]: source.catalog,
      }),
      now: () => new Date("2026-08-04T19:00:00.000Z"),
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (() => {
      throw new Error("network access is forbidden during verification");
    }) as typeof fetch;
    try {
      await expect(verifyFall2026Data(paths.snapshotPath, paths.reportPath, FIXTURE_SECTION_COUNT)).resolves.toEqual({
        sections: 4,
        classifiedRows: 9,
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("rejects a report whose source counts do not match its source records", async () => {
    const source = await fixtures();
    const paths = await outputPaths();
    await importFall2026({
      ...paths,
      minimumSectionCount: FIXTURE_SECTION_COUNT,
      fetchImpl: fetchFrom({
        [SCHEDULE_URL]: source.schedule,
        [CATALOG_INDEX_URL]: catalogIndex(),
        [catalogUrl]: source.catalog,
      }),
      now: () => new Date("2026-08-04T19:00:00.000Z"),
    });
    const report = JSON.parse(await readFile(paths.reportPath, "utf8")) as ImportReport;
    report.counts.catalogPages = 99;
    await writeFile(paths.reportPath, JSON.stringify(report));

    await expect(verifyFall2026Data(paths.snapshotPath, paths.reportPath, FIXTURE_SECTION_COUNT)).rejects.toThrow(
      /catalog page count/i,
    );
  });

  it("rejects a normalized meeting with an impossible clock value", async () => {
    const paths = await importedFixtureArtifacts();
    const snapshot = JSON.parse(await readFile(paths.snapshotPath, "utf8")) as CourseSnapshot;
    snapshot.sections[0].meetings[0].startTime = "09:99";
    await writeFile(paths.snapshotPath, JSON.stringify(snapshot));

    await expect(verifyFall2026Data(paths.snapshotPath, paths.reportPath, FIXTURE_SECTION_COUNT)).rejects.toThrow(
      /invalid start time.*80565/i,
    );
  });

  it("rejects a normalized course code that differs from its subject and catalog number", async () => {
    const paths = await importedFixtureArtifacts();
    const snapshot = JSON.parse(await readFile(paths.snapshotPath, "utf8")) as CourseSnapshot;
    snapshot.sections[0].courseCode = "AMST 999";
    await writeFile(paths.snapshotPath, JSON.stringify(snapshot));

    await expect(verifyFall2026Data(paths.snapshotPath, paths.reportPath, FIXTURE_SECTION_COUNT)).rejects.toThrow(
      /course code does not match.*80565/i,
    );
  });

  it("rejects unmatched prerequisite metadata that differs from its referenced section", async () => {
    const paths = await importedFixtureArtifacts();
    const report = JSON.parse(await readFile(paths.reportPath, "utf8")) as ImportReport;
    report.unmatchedPrerequisites[0].title = "Wrong section title";
    await writeFile(paths.reportPath, JSON.stringify(report));

    await expect(verifyFall2026Data(paths.snapshotPath, paths.reportPath, FIXTURE_SECTION_COUNT)).rejects.toThrow(
      /unmatched prerequisite identity.*80116/i,
    );
  });

  it("rejects a sourced prerequisite URL absent from the report's fetched catalog pages", async () => {
    const paths = await importedFixtureArtifacts();
    const snapshot = JSON.parse(await readFile(paths.snapshotPath, "utf8")) as CourseSnapshot;
    const sourcedSection = snapshot.sections.find(
      (section) => section.prerequisite.status !== "unavailable",
    );
    if (!sourcedSection || sourcedSection.prerequisite.status === "unavailable") {
      throw new Error("fixture must include a sourced prerequisite");
    }
    sourcedSection.prerequisite.sourceUrl =
      "https://www.kenyon.edu/catalog/not-fetched/";
    await writeFile(paths.snapshotPath, JSON.stringify(snapshot));

    await expect(verifyFall2026Data(paths.snapshotPath, paths.reportPath, FIXTURE_SECTION_COUNT)).rejects.toThrow(
      /prerequisite source.*fetched catalog pages/i,
    );
  });
});

describe("change detection", () => {
  async function importInto(
    paths: Awaited<ReturnType<typeof outputPaths>>,
    schedule: string,
    importedAt: string,
  ) {
    const source = await fixtures();
    return importFall2026({
      ...paths,
      minimumSectionCount: FIXTURE_SECTION_COUNT,
      fetchImpl: fetchFrom({
        [SCHEDULE_URL]: schedule,
        [CATALOG_INDEX_URL]: catalogIndex(),
        [catalogUrl]: source.catalog,
      }),
      now: () => new Date(importedAt),
    });
  }

  it("writes nothing when a re-import scrapes identical data", async () => {
    const source = await fixtures();
    const paths = await outputPaths();
    const first = await importInto(paths, source.schedule, "2026-08-04T19:00:00.000Z");
    const writtenAt = await Promise.all([
      stat(paths.snapshotPath),
      stat(paths.reportPath),
    ]);

    const second = await importInto(paths, source.schedule, "2026-08-05T19:00:00.000Z");
    const reReadAt = await Promise.all([
      stat(paths.snapshotPath),
      stat(paths.reportPath),
    ]);

    expect(first.outcome).toBe("changed");
    expect(second.outcome).toBe("unchanged");
    // `importedAt` must stay the moment the data last changed, not the moment
    // the job last ran -- otherwise every scheduled run churns the snapshot.
    expect(second.snapshot.importedAt).toBe("2026-08-04T19:00:00.000Z");
    expect(reReadAt.map(({ mtimeMs }) => mtimeMs)).toEqual(
      writtenAt.map(({ mtimeMs }) => mtimeMs),
    );
  });

  it("rewrites both artifacts when a single meeting room changes", async () => {
    const source = await fixtures();
    const paths = await outputPaths();
    await importInto(paths, source.schedule, "2026-08-04T19:00:00.000Z");

    const moved = source.schedule.replace("CHL300", "CHL301");
    const second = await importInto(paths, moved, "2026-08-05T19:00:00.000Z");

    expect(second.outcome).toBe("changed");
    expect(second.snapshot.importedAt).toBe("2026-08-05T19:00:00.000Z");
    expect(second.snapshot.sections[0].meetings[0].room).toBe("CHL301");
  });

  it("treats a differing importedAt alone as unchanged", async () => {
    const source = await fixtures();
    const paths = await outputPaths();
    await importInto(paths, source.schedule, "2026-08-04T19:00:00.000Z");

    const shifted = "2026-01-01T00:00:00.000Z";
    const snapshot = JSON.parse(await readFile(paths.snapshotPath, "utf8")) as CourseSnapshot;
    const report = JSON.parse(await readFile(paths.reportPath, "utf8")) as ImportReport;
    snapshot.importedAt = shifted;
    report.importedAt = shifted;
    await writeFile(paths.snapshotPath, JSON.stringify(snapshot));
    await writeFile(paths.reportPath, JSON.stringify(report));

    const second = await importInto(paths, source.schedule, "2026-08-05T19:00:00.000Z");

    expect(second.outcome).toBe("unchanged");
    expect(second.snapshot.importedAt).toBe(shifted);
  });

  it("writes normally on a first run with no committed artifacts", async () => {
    const source = await fixtures();
    const paths = await outputPaths();

    const result = await importInto(paths, source.schedule, "2026-08-04T19:00:00.000Z");

    expect(result.outcome).toBe("changed");
    expect(result.snapshot.sections).toHaveLength(FIXTURE_SECTION_COUNT);
  });

  it("treats unreadable committed artifacts as changed rather than failing", async () => {
    const source = await fixtures();
    const paths = await outputPaths();
    await seedPreviousArtifacts(paths);

    const result = await importInto(paths, source.schedule, "2026-08-04T19:00:00.000Z");

    expect(result.outcome).toBe("changed");
  });
});

describe("source request resilience", () => {
  const noSleep = async () => {};

  /** Fails the schedule URL `failures` times with `status`, then serves it. */
  function flakyScheduleFetch(
    schedule: string,
    catalog: string,
    failures: number,
    status: number,
  ): { fetchImpl: typeof fetch; scheduleAttempts: () => number } {
    const fallback = fetchFrom({
      [CATALOG_INDEX_URL]: catalogIndex(),
      [catalogUrl]: catalog,
    });
    let attempts = 0;
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : input.toString();
      if (url !== SCHEDULE_URL) return fallback(input, init);
      attempts += 1;
      return attempts <= failures
        ? responseFrom("upstream unavailable", url, status)
        : responseFrom(schedule, url);
    }) as typeof fetch;
    return { fetchImpl, scheduleAttempts: () => attempts };
  }

  it("retries a transient 503 and succeeds on the third attempt", async () => {
    const source = await fixtures();
    const paths = await outputPaths();
    const { fetchImpl, scheduleAttempts } = flakyScheduleFetch(
      source.schedule,
      source.catalog,
      2,
      503,
    );

    const { report } = await importFall2026({
      ...paths,
      minimumSectionCount: FIXTURE_SECTION_COUNT,
      fetchImpl,
      sleep: noSleep,
      now: () => new Date("2026-08-04T19:00:00.000Z"),
    });

    expect(scheduleAttempts()).toBe(3);
    expect(report.counts.sections).toBe(FIXTURE_SECTION_COUNT);
  });

  it("retries a 429 rate-limit response", async () => {
    const source = await fixtures();
    const paths = await outputPaths();
    const { fetchImpl, scheduleAttempts } = flakyScheduleFetch(
      source.schedule,
      source.catalog,
      1,
      429,
    );

    await importFall2026({
      ...paths,
      minimumSectionCount: FIXTURE_SECTION_COUNT,
      fetchImpl,
      sleep: noSleep,
      now: () => new Date("2026-08-04T19:00:00.000Z"),
    });

    expect(scheduleAttempts()).toBe(2);
  });

  it("gives up after the configured attempt count and preserves artifacts", async () => {
    const source = await fixtures();
    const paths = await outputPaths();
    await seedPreviousArtifacts(paths);
    const { fetchImpl, scheduleAttempts } = flakyScheduleFetch(
      source.schedule,
      source.catalog,
      Number.POSITIVE_INFINITY,
      503,
    );

    await expect(
      importFall2026({
        ...paths,
        minimumSectionCount: FIXTURE_SECTION_COUNT,
        fetchImpl,
        sleep: noSleep,
      }),
    ).rejects.toThrow(/HTTP 503.*after 3 attempts/i);
    expect(scheduleAttempts()).toBe(3);
    await expectPreviousArtifacts(paths);
  });

  it("does not retry a 404, which signals a real structural change", async () => {
    const source = await fixtures();
    const paths = await outputPaths();
    const { fetchImpl, scheduleAttempts } = flakyScheduleFetch(
      source.schedule,
      source.catalog,
      Number.POSITIVE_INFINITY,
      404,
    );

    await expect(
      importFall2026({
        ...paths,
        minimumSectionCount: FIXTURE_SECTION_COUNT,
        fetchImpl,
        sleep: noSleep,
      }),
    ).rejects.toThrow(/failed to fetch.*HTTP 404/i);
    expect(scheduleAttempts()).toBe(1);
  });

  it("backs off for increasing delays between attempts", async () => {
    const source = await fixtures();
    const paths = await outputPaths();
    const delays: number[] = [];
    const { fetchImpl } = flakyScheduleFetch(source.schedule, source.catalog, 2, 503);

    await importFall2026({
      ...paths,
      minimumSectionCount: FIXTURE_SECTION_COUNT,
      fetchImpl,
      retryBaseDelayMs: 100,
      sleep: async (milliseconds) => {
        delays.push(milliseconds);
      },
      now: () => new Date("2026-08-04T19:00:00.000Z"),
    });

    expect(delays).toEqual([100, 200]);
  });

  it("does not retry an allowlist rejection", async () => {
    const source = await fixtures();
    const paths = await outputPaths();
    let scheduleAttempts = 0;
    const fallback = fetchFrom({
      [CATALOG_INDEX_URL]: catalogIndex(),
      [catalogUrl]: source.catalog,
    });
    const offOriginFetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : input.toString();
      if (url !== SCHEDULE_URL) return fallback(input, init);
      scheduleAttempts += 1;
      return responseFrom(source.schedule, "https://attacker.example/fall-2026.html");
    }) as typeof fetch;

    await expect(
      importFall2026({
        ...paths,
        minimumSectionCount: FIXTURE_SECTION_COUNT,
        fetchImpl: offOriginFetch,
        sleep: noSleep,
      }),
    ).rejects.toThrow(/final.*approved.*registrar\.kenyon\.edu/i);
    expect(scheduleAttempts).toBe(1);
  });

  it("sends an identifying user-agent on every request", async () => {
    const source = await fixtures();
    const paths = await outputPaths();
    const agents: Array<string | undefined> = [];
    const fixtureFetch = fetchFrom({
      [SCHEDULE_URL]: source.schedule,
      [CATALOG_INDEX_URL]: catalogIndex(),
      [catalogUrl]: source.catalog,
    });
    const recordingFetch = (async (input: string | URL | Request, init?: RequestInit) => {
      agents.push(new Headers(init?.headers).get("user-agent") ?? undefined);
      return fixtureFetch(input, init);
    }) as typeof fetch;

    await importFall2026({
      ...paths,
      minimumSectionCount: FIXTURE_SECTION_COUNT,
      fetchImpl: recordingFetch,
      now: () => new Date("2026-08-04T19:00:00.000Z"),
    });

    expect(agents.length).toBeGreaterThan(0);
    expect(agents.every((agent) => agent?.includes("kenyon-class-schedule-planner"))).toBe(true);
  });

  it("never exceeds the configured catalog request concurrency", async () => {
    const source = await fixtures();
    const paths = await outputPaths();
    const pageUrls = Array.from(
      { length: 20 },
      (_, index) => `https://www.kenyon.edu/catalog/dept-${index}/`,
    );
    const indexHtml = catalogIndex().replace(
      `<li><a class="reference_nav_child_link" href="${catalogUrl}">American Studies</a></li>`,
      pageUrls
        .map((url, index) => `<li><a class="reference_nav_child_link" href="${url}">Dept ${index}</a></li>`)
        .join(""),
    );
    const values: Record<string, string> = {
      [SCHEDULE_URL]: source.schedule,
      [CATALOG_INDEX_URL]: indexHtml,
    };
    for (const url of pageUrls) values[url] = source.catalog;

    const fixtureFetch = fetchFrom(values);
    let inFlight = 0;
    let peakInFlight = 0;
    const observedFetch = (async (input: string | URL | Request, init?: RequestInit) => {
      inFlight += 1;
      peakInFlight = Math.max(peakInFlight, inFlight);
      try {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return await fixtureFetch(input, init);
      } finally {
        inFlight -= 1;
      }
    }) as typeof fetch;

    await importFall2026({
      ...paths,
      minimumSectionCount: FIXTURE_SECTION_COUNT,
      maximumCatalogPages: 30,
      catalogConcurrency: 4,
      fetchImpl: observedFetch,
      now: () => new Date("2026-08-04T19:00:00.000Z"),
    });

    expect(peakInFlight).toBeGreaterThan(1);
    expect(peakInFlight).toBeLessThanOrEqual(4);
  });
});

describe("source character decoding", () => {
  async function importSchedule(
    scheduleBody: Uint8Array,
    scheduleHeaders?: HeadersInit,
  ): Promise<CourseSnapshot> {
    const source = await fixtures();
    const paths = await outputPaths();
    await importFall2026({
      ...paths,
      minimumSectionCount: FIXTURE_SECTION_COUNT,
      fetchImpl: fetchWithRawSchedule(
        scheduleBody,
        {
          [CATALOG_INDEX_URL]: catalogIndex(),
          [catalogUrl]: source.catalog,
        },
        scheduleHeaders,
      ),
      now: () => new Date("2026-08-04T19:00:00.000Z"),
    });
    return JSON.parse(await readFile(paths.snapshotPath, "utf8")) as CourseSnapshot;
  }

  function instructors(snapshot: CourseSnapshot): string[] {
    return snapshot.sections.flatMap((section) => section.instructors);
  }

  it("decodes a windows-1252 schedule that declares no charset", async () => {
    // The live registrar page is served as bare `text/html` with windows-1252
    // bytes, so a UTF-8 assumption corrupts accented instructor names.
    const snapshot = await importSchedule(await windows1252ScheduleBytes());

    expect(instructors(snapshot)).toContain("López, I");
    expect(instructors(snapshot)).toContain("del Río Arrillaga, D");
    expect(JSON.stringify(snapshot)).not.toContain("�");
  });

  it("honors an explicit utf-8 charset in the Content-Type header", async () => {
    const utf8Schedule = (await windows1252ScheduleBytes()).toString("latin1");
    const snapshot = await importSchedule(
      Buffer.from(utf8Schedule, "utf8"),
      { "content-type": "text/html; charset=utf-8" },
    );

    expect(instructors(snapshot)).toContain("López, I");
    expect(JSON.stringify(snapshot)).not.toContain("�");
  });

  it("honors a meta charset declaration when the header omits one", async () => {
    const windows1252 = await windows1252ScheduleBytes();
    const declared = Buffer.concat([
      Buffer.from('<meta charset="windows-1252">', "ascii"),
      windows1252,
    ]);
    const snapshot = await importSchedule(declared);

    expect(instructors(snapshot)).toContain("López, I");
  });

  it("does not re-decode valid utf-8 bytes as windows-1252", async () => {
    const utf8Schedule = (await windows1252ScheduleBytes()).toString("latin1");
    const snapshot = await importSchedule(Buffer.from(utf8Schedule, "utf8"));

    // Mis-decoding valid UTF-8 as windows-1252 yields mojibake ("LÃ³pez").
    expect(instructors(snapshot)).toContain("López, I");
    expect(JSON.stringify(snapshot)).not.toContain("Ã");
  });
});
