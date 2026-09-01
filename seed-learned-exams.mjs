// Fold the graded results this project has already written into the answer bank.
//
// Every run writes an exam-results-*.json holding, per quiz, what the site's own
// grading said about each question. That is the same material the runner now
// files into exams-learned.js as it goes; this catches up the reports that were
// written before it did.
//
//   node seed-learned-exams.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rememberLearnedExamFromReport, learnedExamStats } from "./runner.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const before = learnedExamStats();

let reports = 0;
let quizzes = 0;
for (const name of fs.readdirSync(here).filter((n) => /^exam-results-.+\.json$/.test(n))) {
  let report;
  try {
    report = JSON.parse(fs.readFileSync(path.join(here, name), "utf8"));
  } catch {
    continue;
  }
  reports++;
  for (const learned of report.learned || []) {
    if (rememberLearnedExamFromReport(learned)) quizzes++;
  }
}

const after = learnedExamStats();
console.log(`Read ${reports} report(s); ${quizzes} quiz record(s) added something.`);
console.log(`Answer bank: ${before.exams} → ${after.exams} exam(s), ${before.questions} → ${after.questions} confirmed answer(s).`);
