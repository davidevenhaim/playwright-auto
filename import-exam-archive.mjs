// Merge an extracted exam archive from another runner into this checkout.
//
// Usage: node import-exam-archive.mjs /path/to/extracted/archive
//
// Confirmed answers from the imported (newer) archive win exact question-key
// conflicts. Rejected attempts are unioned, then contradictions are removed so
// the automation never submits an answer that the server also rejected.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = path.resolve(process.argv[2] || "");
if (!process.argv[2] || !fs.statSync(source, { throwIfNoEntry: false })?.isDirectory()) {
  console.error("Usage: node import-exam-archive.mjs /path/to/extracted/archive");
  process.exit(1);
}

const readJson = (file, fallback = {}) => {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
};
const uniqueLists = (lists = []) => {
  const seen = new Set();
  return lists.filter((list) => {
    const key = JSON.stringify(list);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
const clean = (value = "") => String(value).normalize("NFKC").replace(/\s+/g, " ").trim();
const answerKey = (value = "") => clean(value)
  .replace(/^\d+[\s.)]*/, "")
  .replace(/(?:יש לבחור|select)\s+(?:one|two|three|four|five|\d+).*$/i, "")
  .replace(/[^\p{L}\p{N}]+/gu, " ").trim().toLocaleLowerCase().slice(0, 64);
const sameAnswer = (one, other) => {
  const a = clean(one), b = clean(other);
  if (!a || !b) return false;
  if (a === b) return true;
  const [longer, shorter] = a.length >= b.length ? [a, b] : [b, a];
  return shorter.length >= 2 && longer.startsWith(shorter) && /[\s.,:;!?]/.test(longer[shorter.length]);
};

// Merge blind-answer memory. The archive was produced after this checkout's
// memory, so a confirmed answer from it is the freshest grade for a collision.
const memoryPath = path.join(here, "answer-memory.json");
const localMemory = readJson(memoryPath, { learned: {}, rejected: {} });
const remoteMemory = readJson(path.join(source, "answer-memory.json"), { learned: {}, rejected: {} });
const memory = {
  learned: { ...(localMemory.learned || {}), ...(remoteMemory.learned || {}) },
  rejected: { ...(localMemory.rejected || {}) },
  savedAt: new Date().toISOString()
};
for (const [key, incoming] of Object.entries(remoteMemory.rejected || {})) {
  const current = memory.rejected[key] || {};
  memory.rejected[key] = {
    options: [...new Set([...(current.options || []), ...(incoming.options || [])])],
    sets: uniqueLists([...(current.sets || []), ...(incoming.sets || [])]),
    orders: uniqueLists([...(current.orders || []), ...(incoming.orders || [])])
  };
}

let contradictions = 0;
for (const [key, answers] of Object.entries(memory.learned)) {
  const refused = memory.rejected[key];
  if (!refused) continue;
  const signature = [...answers].sort().join("\0");
  const rejectedSet = (refused.sets || []).some((set) => [...set].sort().join("\0") === signature);
  const rejectedOption = (refused.options || []).some((wrong) => answers.some((answer) => sameAnswer(wrong, answer)));
  if (rejectedSet || rejectedOption) {
    delete memory.learned[key];
    contradictions++;
  }
}
fs.writeFileSync(memoryPath, `${JSON.stringify(memory, null, 2)}\n`);

// Merge whole-exam knowledge. Matches use the same prefix rule as exams.js;
// imported confirmations replace older ones, while unrelated local questions
// remain available.
const tidyQuestion = (value = "") => clean(value).replace(/[^\p{L}\p{N}]+/gu, " ").trim().toLocaleLowerCase();
const sameQuestion = (one, other) => {
  const a = tidyQuestion(one), b = tidyQuestion(other);
  const overlap = Math.min(a.length, b.length);
  return overlap >= 20 && (a.startsWith(b) || b.startsWith(a));
};
const bankPath = path.join(here, "learned-exams.json");
const bank = readJson(bankPath);
const incomingBank = readJson(path.join(source, "learned-exams.json"));
for (const [id, incoming] of Object.entries(incomingBank)) {
  if (!bank[id]) {
    bank[id] = incoming;
    continue;
  }
  const questions = [...(bank[id].questions || [])];
  for (const question of incoming.questions || []) {
    const at = questions.findIndex((candidate) => sameQuestion(candidate.match, question.match));
    if (at >= 0) questions[at] = question;
    else questions.push(question);
  }
  bank[id] = {
    ...bank[id],
    ...Object.fromEntries(Object.entries(incoming).filter(([, value]) => value != null)),
    questions
  };
}
const sortedBank = Object.fromEntries(Object.entries(bank).sort(([a], [b]) => a.localeCompare(b)));
fs.writeFileSync(bankPath, `${JSON.stringify(sortedBank, null, 2)}\n`);

// Keep the raw result reports. They are also replayed below: the runner uses
// the combined rejection history to infer a single answer when every other
// offered option has already been ruled out.
const reportNames = fs.readdirSync(source).filter((name) => /^exam-results-.+\.json$/.test(name)).sort();
for (const name of reportNames) fs.copyFileSync(path.join(source, name), path.join(here, name));

const { rememberLearnedExamFromReport, learnedExamStats } = await import("./runner.js");
let enriched = 0;
for (const name of reportNames) {
  const report = readJson(path.join(source, name));
  for (const learned of report.learned || []) {
    if (rememberLearnedExamFromReport(learned)) enriched++;
  }
}

// If replaying added nothing, force the generated module to be refreshed by
// importing one synthetic confirmed record already present in the merged bank.
// Normally replaying failed exams adds or refreshes many records.
if (!enriched) {
  const first = Object.values(sortedBank).find((exam) => exam.questions?.length);
  const question = first?.questions?.[0];
  if (first && question) {
    rememberLearnedExamFromReport({
      exam: first.name,
      module: first.name,
      chapter: first.section,
      url: first.url,
      questions: [{
        question: question.match,
        type: question.type,
        confirmedAnswers: question.type === "single" ? [question.answer] : question.answers,
        options: []
      }]
    });
  }
}

const stats = learnedExamStats();
console.log(`Imported ${reportNames.length} result report(s).`);
console.log(`Answer memory: ${Object.keys(memory.learned).length} confirmed, ${Object.keys(memory.rejected).length} narrowed; removed ${contradictions} contradiction(s).`);
console.log(`Answer bank: ${stats.exams} exam(s), ${stats.questions} confirmed answer(s); ${enriched} report record(s) enriched it.`);
