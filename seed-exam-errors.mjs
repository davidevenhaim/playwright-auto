// Fill the error report in from the runs already on disk.
//
// The runner writes exam-errors.json as each failure happens, so it only knows
// about runs made since that existed. Every run has always written its own
// report, though, and those say which exams failed and why.
//
//   node seed-exam-errors.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { recordExamErrorFromReport, examErrorReport } from "./runner.js";

const here = path.dirname(fileURLToPath(import.meta.url));

let reports = 0;
let failures = 0;
// Oldest first, so the newest run has the last word on whether an exam is still
// failing — one that passed on a later run should not read as broken.
const names = fs.readdirSync(here)
  .filter((name) => /^exam-results-.+\.json$/.test(name))
  .sort((a, b) => fs.statSync(path.join(here, a)).mtimeMs - fs.statSync(path.join(here, b)).mtimeMs);

for (const name of names) {
  let report;
  try {
    report = JSON.parse(fs.readFileSync(path.join(here, name), "utf8"));
  } catch {
    continue;
  }
  reports++;
  for (const exam of report.exams || []) {
    if (recordExamErrorFromReport(exam, report.session)) failures++;
  }
}

const now = examErrorReport();
console.log(`Read ${reports} report(s), ${failures} exam outcome(s).`);
console.log(`Exam errors: ${now.stillFailing} still failing, ${now.resolved} since fixed.`);
console.log("Written to exam-errors.json and exam-errors.md.");
