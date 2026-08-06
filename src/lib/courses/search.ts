import type { CourseSection } from "./types";

const subjectAliases: Record<string, string> = {
  AMES: "Asian and Middle East Studies",
  AMST: "American Studies",
  ANTH: "Anthropology",
  ARBC: "Arabic",
  ARHS: "Art History",
  ARTS: "Studio Art",
  ASL: "American Sign Language",
  BIOL: "Biology",
  CHEM: "Chemistry",
  CHNS: "Chinese",
  CLAS: "Classics",
  COMP: "Computer Science",
  DANC: "Dance",
  DDF: "Dance, Drama and Film",
  DRAM: "Drama",
  ECON: "Economics",
  ENGL: "English",
  ENVS: "Environmental Studies",
  FILM: "Film",
  FREN: "French",
  GERM: "German",
  GREK: "Greek",
  GSS: "Gender and Sexuality Studies",
  HIST: "History",
  INDS: "International Studies",
  INST: "Interdisciplinary Studies",
  IPHS: "Integrated Program in Humane Studies",
  ITAL: "Italian",
  JAPN: "Japanese",
  LATN: "Latin",
  MATH: "Mathematics",
  MLL: "Modern Languages and Literatures",
  MUSC: "Music",
  NEUR: "Neuroscience",
  PHIL: "Philosophy",
  PHYS: "Physics",
  PSCI: "Political Science",
  PSYC: "Psychology",
  RUSS: "Russian",
  SPAN: "Spanish",
  STAT: "Statistics",
};

/**
 * Folds case and diacritics so a student typing "lopez" on a US keyboard finds
 * "López". Decomposing to NFD splits an accented letter into its base letter
 * plus a combining mark, which the range below then strips. Applied to both the
 * query and the searchable text, so either spelling matches the other.
 */
function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function compareSections(left: CourseSection, right: CourseSection) {
  return (
    left.subject.localeCompare(right.subject) ||
    left.catalogNumber.localeCompare(right.catalogNumber, undefined, { numeric: true }) ||
    left.sectionNumber.localeCompare(right.sectionNumber, undefined, { numeric: true })
  );
}

export function searchSections(sections: CourseSection[], query: string) {
  const queryTokens = normalizeSearchText(query).split(" ").filter(Boolean);

  return sections
    .filter((section) => {
      if (queryTokens.length === 0) return true;

      const searchableText = normalizeSearchText(
        [
          section.subject,
          subjectAliases[section.subject] ?? "",
          section.catalogNumber,
          section.courseCode,
          section.title,
          ...section.instructors,
        ].join(" "),
      );

      return queryTokens.every((token) => searchableText.includes(token));
    })
    .toSorted(compareSections);
}
