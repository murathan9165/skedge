import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  parseCatalogCoursePage,
  parseCatalogIndexHtml,
  parseCatalogSubpageLinks,
} from "../../scripts/courses/parse-catalog";

const fixturePath = path.join(
  process.cwd(),
  "tests/fixtures/kenyon/catalog-course-page.html",
);
const sourceUrl = "https://www.kenyon.edu/catalog/amst/";

describe("parseCatalogCoursePage", () => {
  it("extracts explicit no-prerequisite text", async () => {
    const courses = parseCatalogCoursePage(await readFile(fixturePath, "utf8"), sourceUrl);

    expect(courses[0]).toEqual({
      courseCode: "AMST 140",
      matchKey: "AMST 140",
      prerequisite: { status: "none", text: "No prerequisite.", sourceUrl },
    });
  });

  it("isolates no-prerequisite text when source paragraphs omit sentence spacing", () => {
    const courses = parseCatalogCoursePage(
      '<div class="accordion courses"><div class="accordion_item"><span class="course_item_code">DANC 105</span><div class="accordion_item_content">Explore choreographic process.No prerequisite.</div></div></div>',
      sourceUrl,
    );

    expect(courses[0].prerequisite).toEqual({
      status: "none",
      text: "No prerequisite.",
      sourceUrl,
    });
  });

  it("extracts a published prerequisite sentence", async () => {
    const courses = parseCatalogCoursePage(await readFile(fixturePath, "utf8"), sourceUrl);

    expect(courses[1].prerequisite).toEqual({
      status: "known",
      text: "Prerequisite: AMST 108.",
      sourceUrl,
    });
  });

  it("preserves standing and permission eligibility clauses together", async () => {
    const courses = parseCatalogCoursePage(await readFile(fixturePath, "utf8"), sourceUrl);

    expect(courses[2].prerequisite).toEqual({
      status: "known",
      text: "Sophomore standing. Permission of the instructor required.",
      sourceUrl,
    });
  });

  it("preserves class-year, major, and placement eligibility clauses", () => {
    const courses = parseCatalogCoursePage(
      '<div class="accordion courses"><div class="accordion_item"><span class="course_item_code">AMST 401</span><div class="accordion_item_content">Open only to junior and senior American studies majors. Placement by examination is required.</div></div></div>',
      sourceUrl,
    );

    expect(courses[0].prerequisite).toEqual({
      status: "known",
      text: "Open only to junior and senior American studies majors. Placement by examination is required.",
      sourceUrl,
    });
  });

  it("treats a qualified no-prerequisite statement as known eligibility text", () => {
    const courses = parseCatalogCoursePage(
      '<div class="accordion courses"><div class="accordion_item"><span class="course_item_code">HIST 258</span><div class="accordion_item_content">No prerequisite: Sophomore standing.</div></div></div>',
      sourceUrl,
    );

    expect(courses[0].prerequisite).toEqual({
      status: "known",
      text: "No prerequisite: Sophomore standing.",
      sourceUrl,
    });
  });

  it("does not confuse a degree requirement with enrollment eligibility", () => {
    const courses = parseCatalogCoursePage(
      '<div class="accordion courses"><div class="accordion_item"><span class="course_item_code">ECON 101</span><div class="accordion_item_content">This course is required for the major. No prerequisite.</div></div></div>',
      sourceUrl,
    );

    expect(courses[0].prerequisite).toEqual({
      status: "none",
      text: "No prerequisite.",
      sourceUrl,
    });
  });

  it("excludes a course required of majors while retaining mandatory permission", () => {
    const courses = parseCatalogCoursePage(
      '<div class="accordion courses"><div class="accordion_item"><span class="course_item_code">AMST 400</span><div class="accordion_item_content">The course is required of all American studies senior majors and concentrators. Permission of instructor required.</div></div></div>',
      sourceUrl,
    );

    expect(courses[0].prerequisite).toEqual({
      status: "known",
      text: "Permission of instructor required.",
      sourceUrl,
    });
  });

  it("excludes recommended standing while retaining an actual prerequisite", () => {
    const courses = parseCatalogCoursePage(
      '<div class="accordion courses"><div class="accordion_item"><span class="course_item_code">MATH 341</span><div class="accordion_item_content">Junior standing is recommended. Prerequisite: MATH 212 and 222.</div></div></div>',
      sourceUrl,
    );

    expect(courses[0].prerequisite).toEqual({
      status: "known",
      text: "Prerequisite: MATH 212 and 222.",
      sourceUrl,
    });
  });

  it.each([
    [
      "BIOL 109Y",
      "This is the first laboratory course a student takes and is a prerequisite for all upper-division laboratory courses. Prerequisite: completion or concurrent enrollment in BIOL 115 or equivalent.",
      "Prerequisite: completion or concurrent enrollment in BIOL 115 or equivalent.",
    ],
    [
      "DRAM 111",
      "Because this course is an introduction to the vocabulary of the theater, it is a prerequisite to most other courses in the department.",
      null,
    ],
    [
      "MUSC 102",
      "This course fulfills the music history prerequisite for upper-level courses. MUSC 102, 105, and 107 satisfy the same prerequisites.",
      null,
    ],
  ])(
    "excludes outgoing prerequisite claims for %s",
    (courseCode, description, expectedText) => {
      const courses = parseCatalogCoursePage(
        `<div class="accordion courses"><div class="accordion_item"><span class="course_item_code">${courseCode}</span><div class="accordion_item_content">${description}</div></div></div>`,
        sourceUrl,
      );

      expect(courses[0].prerequisite).toEqual(
        expectedText === null
          ? { status: "unavailable" }
          : { status: "known", text: expectedText, sourceUrl },
      );
    },
  );

  it("keeps a repeated eligibility clause once after excluding an outgoing prerequisite", () => {
    const courses = parseCatalogCoursePage(
      '<div class="accordion courses"><div class="accordion_item"><span class="course_item_code">CHEM 375</span><div class="accordion_item_content">Permission of instructor required. Offered every semester.Section 02 (0.5 unit): This section is a prerequisite to CHEM 497 and 498. Permission of instructor required.</div></div></div>',
      sourceUrl,
    );

    expect(courses[0].prerequisite).toEqual({
      status: "known",
      text: "Permission of instructor required.",
      sourceUrl,
    });
  });

  it("retains incoming eligibility prose containing a lowercase word followed by a number", () => {
    const courses = parseCatalogCoursePage(
      '<div class="accordion courses"><div class="accordion_item"><span class="course_item_code">ARHS 110</span><div class="accordion_item_content">Students who score 5 on the AP exam satisfy the prerequisite for this course.</div></div></div>',
      sourceUrl,
    );

    expect(courses[0].prerequisite).toEqual({
      status: "known",
      text: "Students who score 5 on the AP exam satisfy the prerequisite for this course.",
      sourceUrl,
    });
  });

  it("does not treat descriptive 'not limited to' prose as an enrollment restriction", () => {
    const courses = parseCatalogCoursePage(
      '<div class="accordion courses"><div class="accordion_item"><span class="course_item_code">ENGL 386</span><div class="accordion_item_content">Topics include, but are not limited to, race and gender. Prerequisite: ENGL 210 or junior standing.</div></div></div>',
      sourceUrl,
    );

    expect(courses[0].prerequisite).toEqual({
      status: "known",
      text: "Prerequisite: ENGL 210 or junior standing.",
      sourceUrl,
    });
  });

  it("does not turn missing prerequisite text into an explicit none", async () => {
    const courses = parseCatalogCoursePage(await readFile(fixturePath, "utf8"), sourceUrl);

    expect(courses[3].prerequisite).toEqual({ status: "unavailable" });
  });

  it("keeps a catalog course with no published description as unavailable", () => {
    const courses = parseCatalogCoursePage(
      '<div class="accordion courses"><div class="accordion_item"><span class="course_item_code">INDS 101</span><div class="accordion_item_content"></div></div></div>',
      sourceUrl,
    );

    expect(courses[0].prerequisite).toEqual({ status: "unavailable" });
  });

  it("rejects a page whose expected course structure disappeared", () => {
    expect(() => parseCatalogCoursePage("<html><h1>Courses</h1></html>", sourceUrl)).toThrow(
      /expected catalog course structure/i,
    );
  });

  it("accepts a linked catalog page that intentionally lists no course descriptions", () => {
    expect(
      parseCatalogCoursePage(
        '<div class="accordion courses"><div class="typography"><table><tr><td>AMST 305</td></tr></table></div></div>',
        sourceUrl,
      ),
    ).toEqual([]);
  });
});

describe("parseCatalogIndexHtml", () => {
  it("discovers and deduplicates only the linked department catalog pages", () => {
    const indexUrl = "https://www.kenyon.edu/catalog/course-offerings/";
    const html = `
      <ul>
        <li class="reference_nav_item open">
          <div class="reference_nav_item_inner"><a href="${indexUrl}">Course Offerings</a></div>
          <ul class="reference_nav_children">
            <li><a class="reference_nav_child_link" href="/catalog/amst/">American Studies</a></li>
            <li><a class="reference_nav_child_link" href="/catalog/amst/">American Studies duplicate</a></li>
            <li><a class="reference_nav_child_link" href="https://www.kenyon.edu/catalog/anth/">Anthropology</a></li>
          </ul>
        </li>
        <li><a class="reference_nav_child_link" href="/unrelated/">Unrelated</a></li>
      </ul>`;

    expect(parseCatalogIndexHtml(html, indexUrl)).toEqual([
      "https://www.kenyon.edu/catalog/amst/",
      "https://www.kenyon.edu/catalog/anth/",
    ]);
  });
});

describe("parseCatalogSubpageLinks", () => {
  it("discovers course-description children from a linked umbrella page", () => {
    const html = `
      <nav>
        <a class="sub_nav_link" href="/program/requirements/">Requirements</a>
        <a class="sub_nav_link" href="/program/courses-dance/">Courses in Dance</a>
        <a class="sub_nav_link" href="/program/courses-drama/">Courses in Drama</a>
      </nav>`;

    expect(parseCatalogSubpageLinks(html, "https://www.kenyon.edu/program/")).toEqual([
      "https://www.kenyon.edu/program/courses-dance/",
      "https://www.kenyon.edu/program/courses-drama/",
    ]);
  });
});
