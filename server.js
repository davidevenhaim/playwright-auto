import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exams } from "./exams.js";
import { captureCurrentExam, connectBrowser, browserStatus, detectCurrentExam, examsJsFromLearned, getLogs, inspectPage, listSessions, openSalesCoachUrl, processAcademy, processCurrentChapter, processSite, runExam, probeUnanswered, screenshotPage, sessionId, withSession } from "./runner.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const legacyExamResultsPath = path.join(__dirname, "exam-results.json");

// Which browser session a request belongs to. Sessions are separate logins, so
// several accounts can be driven at once; session 1 is the original one and
// keeps the original file names.
function sessionOf(req) {
  return sessionId(req.query?.session || req.body?.session || "1");
}

// Session 1 writes the file names this project has always written; any other
// session tags its own so two accounts running at once never overwrite each
// other's output.
function tag(session) {
  return session === "1" ? "" : `-s${session}`;
}

function capturesPathFor(session) {
  return path.join(__dirname, `captured-exams${tag(session)}.json`);
}

// One file per chapter run, named after the moment the run started, so runs
// accumulate as history instead of overwriting each other.
function examResultsPathFor(startedAt, session) {
  const stamp = new Date(startedAt || Date.now()).toISOString().slice(0, 19).replace(/:/g, "-");
  return path.join(__dirname, `exam-results-${stamp}${tag(session)}.json`);
}

function listExamResultsFiles(session = null) {
  const all = fs.readdirSync(__dirname)
    .filter((name) => /^exam-results-.+\.json$/.test(name))
    .sort();
  if (!session) return all;
  // A session's own runs if it has any; otherwise everything, so the button
  // still finds the reports written before sessions existed.
  const mine = all.filter((name) => name.endsWith(`${tag(session)}.json`) &&
    (session !== "1" || !/-s[A-Za-z0-9_-]+\.json$/.test(name)));
  return mine.length ? mine : all;
}

function readCaptures(session) {
  try {
    const parsed = JSON.parse(fs.readFileSync(capturesPathFor(session), "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCaptures(session, captures) {
  fs.writeFileSync(capturesPathFor(session), `${JSON.stringify(captures, null, 2)}\n`);
}

function writeExamResults(scope, run, session) {
  const quizzes = (run.results || []).filter((item) => item.type === "quiz");
  const report = {
    generatedAt: new Date().toISOString(),
    scope,
    session,
    startedAt: run.startedAt || null,
    summary: {
      exams: quizzes.length,
      passed: quizzes.filter((item) => item.passed === true).length,
      failed: quizzes.filter((item) => item.passed === false).length,
      // Submitted but returned no per-question grading, e.g. a quiz whose
      // answers the server had already recorded.
      recorded: quizzes.filter((item) => item.passed === null || item.passed === undefined).length,
      resourcesRead: run.resourcesRead || 0,
      processingFailures: run.failed || 0
    },
    // What the walk found level by level, so a chapter it never entered is
    // visible in the report rather than only in the log.
    chapters: run.chapters || [],
    // Every section any listing page offered and what the walk did with each —
    // walked, locked, or cut off by the module limit. A section a page lists but
    // the run never enters shows up here and nowhere else.
    containersSeen: run.containersSeen || [],
    // What the account's XP total did over the run, when the site shows one.
    xp: run.xp || null,
    answersLearned: run.answersLearned || 0,
    // Unknown and partial quizzes captured during a conservative run. Keeping
    // their full controls/options in the report makes the next exams.js update
    // possible without reopening every failed module by hand.
    captures: run.captures || [],
    progressBefore: run.progressBefore || null,
    progressAfter: run.progressAfter || null,
    exams: quizzes.map((item) => ({
      title: item.title,
      module: item.module,
      chapter: item.chapter || null,
      passed: item.passed,
      status: item.status,
      identified: item.identified !== false,
      // Answers filled from a best guess rather than a confirmed key.
      unverified: item.unverified || [],
      // `threshold` is the site's own completionScore; without it a "failed"
      // score cannot be told apart from a merely imperfect one.
      score: { correct: item.correct, total: item.graded, percentage: item.percentage, threshold: item.threshold },
      errors: item.errors || []
    })),
    resources: (run.results || [])
      .filter((item) => item.type === "resource")
      .map((item) => ({ title: item.title, chapter: item.chapter || null, status: item.status })),
    stillIncomplete: run.stillIncomplete || [],
    // Per-question grading for every quiz this run submitted: what was chosen,
    // what the server said about it, and which answers are now settled.
    learned: run.learned || [],
    processingErrors: (run.results || []).filter((item) => item.status === "failed" && item.type !== "quiz")
  };
  const target = examResultsPathFor(run.startedAt, session);
  fs.writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`);

  const learnedFile = writeLearnedAnswers(run, session);
  return { ...report, file: path.basename(target), learnedFile };
}

// A capture run writes two files: the raw JSON, and a draft that can be pasted
// straight into exams.js once its answers are filled in.
function writeCaptureFiles(run, session) {
  const captures = run.captures || [];
  if (!captures.length) return null;
  const stamp = new Date(run.startedAt || Date.now()).toISOString().slice(0, 19).replace(/:/g, "-");
  const jsonName = `academy-captures-${stamp}${tag(session)}.json`;
  const draftName = `exams-draft-${stamp}${tag(session)}.js`;

  fs.writeFileSync(path.join(__dirname, jsonName), `${JSON.stringify(captures, null, 2)}\n`);

  const header = [
    "// Draft entries captured from the Academy. Every answer is blank on purpose:",
    "// the capture reads what each quiz asks, not what the right answer is.",
    "// Fill the answers in, then move these into exams.js.",
    "//",
    `// Captured ${captures.length} quiz(zes) on ${new Date().toISOString()}.`,
    ""
  ].join("\n");
  const body = captures.map((capture) =>
    `// ---- ${capture.chapter || "?"} / ${capture.module || "?"}\n// ${capture.url}\n${capture.examsJsDraft || ""}`
  ).join("\n\n");
  fs.writeFileSync(path.join(__dirname, draftName), `${header}\n${body}\n`);

  return { json: jsonName, draft: draftName };
}

// What a run's grades revealed, written as entries ready to move into exams.js.
// A question the server marked correct becomes a real answer; one it rejected
// is left commented out with the options that are still in play.
function writeLearnedAnswers(run, session) {
  const learned = run.learned || [];
  if (!learned.length) return null;
  const stamp = new Date(run.startedAt || Date.now()).toISOString().slice(0, 19).replace(/:/g, "-");
  const name = `exams-learned-${stamp}${tag(session)}.js`;

  const solved = learned.reduce((total, entry) =>
    total + entry.questions.filter((question) => question.confirmedAnswers).length, 0);
  const asked = learned.reduce((total, entry) => total + entry.questions.length, 0);

  const header = [
    "// Answers confirmed by the site's own grading during this run.",
    `// ${solved} of ${asked} question(s) across ${learned.length} quiz(zes) are settled.`,
    "//",
    "// A question the server marked correct is written as a real entry: whatever",
    "// was selected in it is right. A question it rejected is left commented out",
    "// with the options that have not been ruled out yet — run again to try",
    "// another one. Move the settled entries into exams.js.",
    ""
  ].join("\n");

  fs.writeFileSync(
    path.join(__dirname, name),
    `${header}\n${learned.map(examsJsFromLearned).join("\n\n")}\n`
  );
  return name;
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const chapterWiseEssentials = new Set([
  "construction-is-modernising",
  "financial-services-is-modernising",
  "insurance-is-modernising",
  "manufacturing-is-modernising",
  "restaurants-are-modernising",
  "retail-is-modernising",
  "field-sales-is-modernising",
  "field-service-is-modernising",
  "it-is-modernising",
  "training-is-modernising",
  "warehousing-and-logistics-is-modernising",
  "help-sellers-become-trusted-advisers",
  "help-businesses-use-data-to-make-better-decisions",
  "help-businesses-stay-connected-with-secure-virtual-workspaces",
  "help-businesses-modernise-contract-processes",
  "customer-relationship-management-essentials",
  "document-management-essentials",
  "mobile-forms-essentials",
  "queue-management-essentials",
  "task-management-essentials",
  "training-and-enablement-essentials",
  "virtual-training-essentials",
  "workforce-management-essentials"
  ,"applecare-for-business-quiz"
  ,"apple-device-management-at-work-quiz"
  ,"clienteling-essentials"
  ,"construction-project-management-essentials"
  ,"custom-inspection-solutions-essentials"
  ,"custom-needs-analysis-solutions-essentials"
  ,"customer-onboarding-financial-services-essentials"
  ,"device-management-essentials"
  ,"endpoint-security-essentials"
  ,"field-mapping-essentials"
  ,"food-order-management-essentials"
  ,"food-safety-essentials"
  ,"identity-management-essentials"
  ,"mobile-pos-essentials"
  ,"mobile-pos-restaurants-essentials"
  ,"mobile-scanning-essentials"
  ,"safety-management-warehousing-logistics-essentials"
  ,"shipping-and-receiving-essentials"
  ,"skill-and-work-instruction-essentials"
  ,"wealth-financial-review-essentials"
  ,"wifi-optimisation-essentials"
  ,"quality-control-essentials"
  ,"stock-management-warehousing-logistics-essentials"
  ,"kitchen-display-system-essentials"
  ,"work-order-management-essentials-final"
]);

app.get("/api/exams", (_req, res) => {
  res.json(
    Object.entries(exams).map(([id, exam]) => ({
      id,
      name: exam.name,
      questionCount: exam.questions.length,
      section: exam.section || (chapterWiseEssentials.has(id) ? "Chapter Wise Essentials" : "Core Exams")
    }))
  );
});

// Which sessions the server knows about and which of them have a live window.
app.get("/api/sessions", (_req, res) => {
  res.json({ sessions: listSessions() });
});

app.get("/api/status", async (req, res) => {
  res.json(await withSession(sessionOf(req), () => browserStatus()));
});

app.get("/api/logs", (req, res) => {
  res.json({ session: sessionOf(req), logs: withSession(sessionOf(req), () => getLogs()) });
});

app.get("/api/detect", async (req, res) => {
  try {
    res.json(await withSession(sessionOf(req), () => detectCurrentExam()));
  } catch (error) {
    res.status(404).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.get("/api/captures", (req, res) => {
  const captures = readCaptures(sessionOf(req));
  res.json({ count: captures.length, captures });
});

app.get("/api/captures/download", (req, res) => {
  const session = sessionOf(req);
  const target = capturesPathFor(session);
  if (!fs.existsSync(target)) writeCaptures(session, []);
  res.download(target, path.basename(target));
});

app.get("/api/results", (req, res) => {
  const files = listExamResultsFiles(sessionOf(req)).reverse();
  res.json({ count: files.length, files });
});

app.get("/api/results/download", (req, res) => {
  const noResults = {
    error: "No graded exam results are available yet. Run Complete Chapter or Complete For You first."
  };
  const requested = typeof req.query.file === "string" ? path.basename(req.query.file) : null;
  const files = listExamResultsFiles(sessionOf(req));
  const name = requested && files.includes(requested) ? requested : files[files.length - 1];
  if (!name) {
    // Fall back to the single-file report written by earlier versions, but only
    // if it holds a real run: the empty placeholder is not worth downloading.
    try {
      const legacy = JSON.parse(fs.readFileSync(legacyExamResultsPath, "utf8"));
      if (!legacy.generatedAt || !Array.isArray(legacy.exams) || !legacy.exams.length) {
        return res.status(404).json(noResults);
      }
    } catch {
      return res.status(404).json(noResults);
    }
    return res.download(legacyExamResultsPath, "exam-results.json");
  }

  const target = path.join(__dirname, name);
  try {
    const report = JSON.parse(fs.readFileSync(target, "utf8"));
    if (!Array.isArray(report.exams)) return res.status(404).json(noResults);
  } catch {
    return res.status(500).json({ error: "The exam results file is invalid. Run the chapter again to rebuild it." });
  }
  res.download(target, name);
});

app.post("/api/capture", async (req, res) => {
  const session = sessionOf(req);
  try {
    const capture = await withSession(session, () => captureCurrentExam());
    // Keep the capture file fresh: each identification replaces the previous exam.
    writeCaptures(session, [capture]);
    res.json({ capture, count: 1, replaced: true });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.delete("/api/captures", (req, res) => {
  writeCaptures(sessionOf(req), []);
  res.json({ count: 0 });
});

app.post("/api/connect", async (req, res) => {
  try {
    res.json(await withSession(sessionOf(req), () => connectBrowser()));
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post("/api/open", async (req, res) => {
  try {
    res.json(await withSession(sessionOf(req), () => openSalesCoachUrl(req.body?.url)));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post("/api/chapter/run", async (req, res) => {
  const session = sessionOf(req);
  try {
    const { skipCompleted = true, limit = 0, submitUnverified = false, blind = false } = req.body || {};
    const run = await withSession(session, () => processCurrentChapter({
      skipCompleted: Boolean(skipCompleted),
      limit: Number(limit) || 0,
      submitUnverified: Boolean(submitUnverified),
      blind: Boolean(blind),
      // Flush after each item so an interrupted run keeps what it finished.
      onProgress: (progress) => writeExamResults("chapter", progress, session)
    }));
    const report = writeExamResults("chapter", run, session);
    res.json({ ...run, report });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

async function runAcademy(req, res) {
  const session = sessionOf(req);
  try {
    const { skipCompleted = true, limit = 0, submitUnverified = false, blind = false } = req.body || {};
    const run = await withSession(session, () => processAcademy({
      skipCompleted: Boolean(skipCompleted),
      limit: Number(limit) || 0,
      submitUnverified: Boolean(submitUnverified),
      blind: Boolean(blind),
      // Flush after each item so an interrupted run keeps what it finished.
      onProgress: (progress) => writeExamResults("academy", progress, session)
    }));
    const report = writeExamResults("academy", run, session);
    res.json({ ...run, report });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
}

app.post("/api/academy/run", runAcademy);

// One button for the whole site: every tab, every program under it, every
// section under that. Same per-module behaviour as a chapter run — a quiz is
// identified and submitted, and one that cannot be passed is reported as a
// failed exam rather than stopping the run.
app.post("/api/site/run", async (req, res) => {
  const session = sessionOf(req);
  try {
    const { skipCompleted = true, limit = 0, submitUnverified = false, blind = false, targetXp = 0 } = req.body || {};
    const run = await withSession(session, () => processSite({
      skipCompleted: Boolean(skipCompleted),
      limit: Number(limit) || 0,
      submitUnverified: Boolean(submitUnverified),
      blind: Boolean(blind),
      targetXp: Number(targetXp) || 0,
      // Flush after each item so an interrupted run keeps what it finished.
      onProgress: (progress) => writeExamResults("site", progress, session)
    }));
    const report = writeExamResults("site", run, session);
    res.json({ ...run, report });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

// Reads every quiz in the Academy without answering or submitting one, and
// writes both the raw captures and a paste-ready exams.js skeleton. This is how
// exams get added without anyone having to sit them first.
app.post("/api/academy/capture", async (req, res) => {
  const session = sessionOf(req);
  try {
    const { limit = 0 } = req.body || {};
    const run = await withSession(session, () => processAcademy({
      // A capture is for building the answer bank, so it wants every quiz,
      // including the ones this account has already passed.
      skipCompleted: false,
      limit: Number(limit) || 0,
      mode: "capture",
      onProgress: (progress) => writeCaptureFiles(progress, session)
    }));
    const files = writeCaptureFiles(run, session);
    res.json({ ...run, files });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});
// The older name for the same run, kept so an open tab of the UI keeps working.
app.post("/api/for-you/run", runAcademy);

// A structural read of whatever the connected tab is showing. This is the tool
// to reach for when the Academy walk skips a row: it reports every link on the
// page and how the collector classified it.
app.get("/api/inspect", async (req, res) => {
  try {
    res.json(await withSession(sessionOf(req), () => inspectPage()));
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

// A picture of the connected tab. The structural scan says what the page
// offers; this says what it actually looks like, which is what tells a stalled
// load apart from a page that rendered something the collector did not expect.
app.get("/api/screenshot", async (req, res) => {
  try {
    const png = await withSession(sessionOf(req), () =>
      screenshotPage({ fullPage: req.query.full === "1" }));
    res.type("png").send(png);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

// What the player is refusing to accept, in its own markup. The run log says
// which question and what controls it holds; this says exactly what is in it.
app.get("/api/probe", async (req, res) => {
  try {
    res.json(await withSession(sessionOf(req), () => probeUnanswered()));
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post("/api/run", async (req, res) => {
  try {
    const { examId, dryRun = false } = req.body || {};
    if (!examId) return res.status(400).json({ error: "examId is required" });
    // The standalone detector is an inspection tool: fill as quickly as the
    // page allows, leave Submit untouched, and let the user review the result.
    res.json(await withSession(sessionOf(req), () => runExam(examId, Boolean(dryRun), { immediate: true })));
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

const port = process.env.PORT || 3030;
app.listen(port, () => {
  console.log(`Apple Exam Runner: http://localhost:${port}`);
});
