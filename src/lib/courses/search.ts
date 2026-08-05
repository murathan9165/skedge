import type { CourseSection } from "./types";

function compareSections(left: CourseSection, right: CourseSection) {
  return (
    left.subject.localeCompare(right.subject) ||
    left.catalogNumber.localeCompare(right.catalogNumber, undefined, { numeric: true }) ||
    left.sectionNumber.localeCompare(right.sectionNumber, undefined, { numeric: true })
  );
}

export function searchSections(sections: CourseSection[], query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase();

  return sections
    .filter((section) => {
      if (!normalizedQuery) return true;

      return [
        section.subject,
        section.catalogNumber,
        section.courseCode,
        section.title,
        ...section.instructors,
      ].some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
    })
    .toSorted(compareSections);
}
