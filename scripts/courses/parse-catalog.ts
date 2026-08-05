import { load } from "cheerio";

import type { Prerequisite } from "../../src/lib/courses/types";

export interface CatalogCourse {
  courseCode: string;
  matchKey: string;
  prerequisite: Prerequisite;
}

export class CatalogStructureError extends Error {}

export function normalizeCourseKey(courseCode: string): string {
  return courseCode.trim().toUpperCase().replace(/\s+/g, " ");
}

function isEligibilityRestriction(sentence: string): boolean {
  const mandatoryStanding =
    /\b(?:first[- ]year|sophomore|junior|senior)\s+(?:standing|status)\b/i.test(sentence) &&
    !/\b(?:standing|status)\s+(?:is\s+)?(?:recommended|advised|preferred|encouraged)\b/i.test(
      sentence,
    );

  return (
    /\bpermission (?:of|from) (?:the )?(?:instructor|department|chair|director)\b/i.test(
      sentence,
    ) ||
    /\b(?:instructor|department|chair|director)(?:'s)? permission\b/i.test(sentence) ||
    /\bconsent of (?:the )?instructor\b/i.test(sentence) ||
    mandatoryStanding ||
    /\b(?:first[- ]years?|sophomores?|juniors?|seniors?)(?:\s+(?:and|or)\s+(?:first[- ]years?|sophomores?|juniors?|seniors?))?\s+only\b/i.test(
      sentence,
    ) ||
    /\b(?:open|available)\s+only\s+to\b/i.test(sentence) ||
    /\b(?:enrollment|admission)\s+(?:is\s+)?(?:limited|restricted)\s+to\b/i.test(
      sentence,
    ) ||
    /^(?:limited|restricted)\s+to\b/i.test(sentence) ||
    /\b(?:course|seminar|class)\s+is\s+(?:limited|restricted)\s+to\b/i.test(sentence) ||
    /\b(?:majors?|minors?|concentrators?)\s+only\b/i.test(sentence) ||
    /\bmust\s+be\b.*\b(?:major|minor|concentrator)\b/i.test(sentence) ||
    /\bplacement\b.*\b(?:required|exam(?:ination)?|test)\b/i.test(sentence) ||
    /\bplacement\s+(?:by|through|into|in|at)\b/i.test(sentence) ||
    /\bproficiency\b.*\b(?:required|exam(?:ination)?|test)\b/i.test(sentence) ||
    /\b(?:students?\s+)?must\s+have\s+completed\b/i.test(sentence)
  );
}

function isOutgoingPrerequisiteStatement(sentence: string): boolean {
  const courseOrSectionIsPrerequisite =
    /\b(?:this|the)\s+(?:course|section)\b[^.!?]*\b(?:is|serves?\s+as)\s+(?:an?\s+)?prerequisite\s+(?:to|for)\b/i.test(
      sentence,
    ) ||
    /\bthis\b[^.!?]*\b(?:course|section)\b[^.!?]*\bis\s+(?:an?\s+)?prerequisite\s+(?:to|for)\b/i.test(
      sentence,
    ) ||
    /\bit\s+is\s+(?:an?\s+)?prerequisite\s+(?:to|for)\b/i.test(sentence);
  const courseFulfillsPrerequisite =
    /\b(?:this|the)\s+(?:course|section)\b[^.!?]*\b(?:fulfills?|satisf(?:y|ies|ied))\b[^.!?]*\bprerequisites?\b/i.test(
      sentence,
    ) ||
    (/\b[A-Z]{2,5}\s+\d+[A-Z]?\b/.test(sentence) &&
      /\b(?:fulfills?|satisf(?:y|ies|ied))\b[^.!?]*\bprerequisites?\b/i.test(
        sentence,
      ));

  return courseOrSectionIsPrerequisite || courseFulfillsPrerequisite;
}

function prerequisiteFromDescription(description: string, sourceUrl: string): Prerequisite {
  const sentences = [...new Intl.Segmenter("en", { granularity: "sentence" }).segment(description)]
    .map(({ segment }) => segment.trim().replace(/\s+/g, " "))
    .filter(Boolean);
  const explicitNone = description.match(/\bNo prerequisites?(?::\s*[^.!?]+)?[.!?]?/i)?.[0];
  const known = [
    ...new Set(
      sentences.filter((sentence) => {
        if (/\bno prerequisites?\b/i.test(sentence)) return isEligibilityRestriction(sentence);
        if (isOutgoingPrerequisiteStatement(sentence)) return false;
        if (/\bprerequisites?\b/i.test(sentence)) return true;
        return isEligibilityRestriction(sentence);
      }),
    ),
  ];

  if (known.length > 0) {
    return { status: "known", text: known.join(" "), sourceUrl };
  }
  if (explicitNone) return { status: "none", text: explicitNone, sourceUrl };
  return { status: "unavailable" };
}

export function parseCatalogCoursePage(html: string, sourceUrl: string): CatalogCourse[] {
  const $ = load(html);
  const coursesContainer = $(".accordion.courses");
  if (coursesContainer.length === 0) {
    throw new CatalogStructureError(`Expected catalog course structure was not found at ${sourceUrl}`);
  }
  const items = $(".accordion.courses .accordion_item");
  if (items.length === 0) return [];

  const courses: CatalogCourse[] = [];
  items.each((_, item) => {
    const courseCode = $(item).find(".course_item_code").first().text().trim().replace(/\s+/g, " ");
    const description = $(item).find(".accordion_item_content").first().text().trim();
    if (!/^[A-Z]{2,5}\s+\d+[A-Z]?$/.test(courseCode)) {
      throw new Error(`Malformed catalog course record at ${sourceUrl}`);
    }
    courses.push({
      courseCode,
      matchKey: normalizeCourseKey(courseCode),
      prerequisite: prerequisiteFromDescription(description, sourceUrl),
    });
  });

  return courses;
}

export function parseCatalogSubpageLinks(html: string, sourceUrl: string): string[] {
  const $ = load(html);
  const links = new Set<string>();
  $("a.sub_nav_link[href]").each((_, link) => {
    const label = $(link).text().trim();
    if (/^courses?\s+(?:in|of)\b/i.test(label)) {
      links.add(new URL($(link).attr("href")!, sourceUrl).href);
    }
  });
  return [...links];
}

export function parseCatalogIndexHtml(html: string, indexUrl: string): string[] {
  const $ = load(html);
  const normalizedIndexUrl = new URL(indexUrl).href;
  const indexLink = $("a[href]")
    .filter((_, link) => {
      try {
        return new URL($(link).attr("href")!, indexUrl).href === normalizedIndexUrl;
      } catch {
        return false;
      }
    })
    .first();
  const branch = indexLink.closest("li.reference_nav_item");
  const links = new Set<string>();
  branch
    .children("ul.reference_nav_children")
    .find("a.reference_nav_child_link[href]")
    .each((_, link) => {
      links.add(new URL($(link).attr("href")!, indexUrl).href);
    });

  if (links.size === 0) {
    throw new Error("Expected department catalog links were not found in the course-offerings index");
  }
  return [...links];
}
