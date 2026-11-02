import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  validateCourseSnapshot,
  validateImportReport,
} from "./import-spring-2027";
import { SPRING_2027_REVIEWED_MINIMUM_SECTION_COUNT } from "./parse-schedule";

export async function verifySpring2027Data(
  snapshotPath = path.join(process.cwd(), "src/data/spring-2027.json"),
  reportPath = path.join(process.cwd(), "src/data/spring-2027.import-report.json"),
  minimumSectionCount = SPRING_2027_REVIEWED_MINIMUM_SECTION_COUNT,
): Promise<{ sections: number; classifiedRows: number }> {
  const [snapshotText, reportText] = await Promise.all([
    readFile(snapshotPath, "utf8"),
    readFile(reportPath, "utf8"),
  ]);
  const snapshot: unknown = JSON.parse(snapshotText);
  validateCourseSnapshot(snapshot);
  const report: unknown = JSON.parse(reportText);
  validateImportReport(report, snapshot, minimumSectionCount);
  return {
    sections: snapshot.sections.length,
    classifiedRows: report.counts.scheduleRows.total,
  };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  verifySpring2027Data()
    .then(({ sections, classifiedRows }) => {
      console.log(
        `Verified ${sections} Spring 2027 sections and ${classifiedRows} classified source rows without network access.`,
      );
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
