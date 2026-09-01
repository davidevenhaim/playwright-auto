// Fold the graded responses inside capture files into the answer memory.
//
// A capture written by "Identify exam & save JSON" or the Academy capture run
// records the questions with every answer blank — that is deliberate, it reads
// what a quiz asks rather than what is right. But the SEED player also keeps the
// account's own submitted attempts on `SeedInterface.QSP`, and the capture takes
// a copy of those: each one says which option was picked and whether the server
// scored it. That is a real answer key, already paid for, sitting unused in the
// Downloads folder.
//
//   node import-captures.mjs [directory ...]
//
// With no arguments it reads this project and ~/Downloads.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rememberExternalAnswers, answerMemoryStats } from "./runner.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const directories = process.argv.slice(2);
if (!directories.length) directories.push(here, path.join(os.homedir(), "Downloads"));

const entries = [];
let files = 0;
let quizzes = 0;
let graded = 0;

for (const directory of directories) {
  let names = [];
  try {
    names = fs.readdirSync(directory).filter((name) => /^(captured-exams|academy-captures).*\.json$/i.test(name));
  } catch {
    console.log(`Skipping ${directory}: cannot read it.`);
    continue;
  }

  for (const name of names) {
    const full = path.join(directory, name);
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(full, "utf8"));
    } catch {
      // A download interrupted halfway leaves a truncated file; there are
      // several of those, and they are not worth stopping for.
      console.log(`  ${name}: not valid JSON, skipped.`);
      continue;
    }
    files++;

    for (const capture of Array.isArray(parsed) ? parsed : [parsed]) {
      quizzes++;
      const questions = capture.questions || [];
      if (!questions.length) continue;

      // The response records option ids; the captured question carries the
      // labels those ids stand for.
      const labelById = new Map();
      const byQuestionId = new Map();
      for (const question of questions) {
        if (question.questionId != null) byQuestionId.set(String(question.questionId), question);
        for (const option of question.options || []) {
          if (option.value != null) labelById.set(String(option.value), option.label);
        }
      }

      for (const attempt of capture.answerKey?.responses || []) {
        for (const answered of attempt.questions || []) {
          const question = byQuestionId.get(String(answered.questionId));
          if (!question) continue;
          const chose = (answered.options || [])
            .map((option) => labelById.get(String(option.questionOptionId)))
            .filter(Boolean);
          if (!chose.length) continue;
          graded++;
          entries.push({
            question: question.text,
            type: question.type || (answered.questionType === "MULTI_SELECT" ? "multiple" : "single"),
            chose,
            // The player scores a question 1 when the whole answer was right and
            // 0 when it was not; anything above zero is a confirmation.
            correct: Number(answered.score) > 0
          });
        }
      }
    }
  }
}

const before = answerMemoryStats();
const added = rememberExternalAnswers(entries);
const after = answerMemoryStats();

console.log(`Read ${files} capture file(s), ${quizzes} quiz(zes), ${graded} graded response(s).`);
console.log(`Added ${added.confirmed} confirmed answer(s) and ruled out ${added.ruledOut} combination(s).`);
console.log(`Answer memory: ${before.confirmed} → ${after.confirmed} confirmed, ${before.narrowed} → ${after.narrowed} narrowed.`);
