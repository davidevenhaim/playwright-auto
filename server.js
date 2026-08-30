import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exams } from "./exams.js";
import { captureCurrentExam, connectBrowser, browserStatus, detectCurrentExam, getLogs, processCurrentChapter, processForYou, runExam } from "./runner.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const capturesPath = path.join(__dirname, "captured-exams.json");
const legacyExamResultsPath = path.join(__dirname, "exam-results.json");

// One file per chapter run, named after the moment the run started, so runs
// accumulate as history instead of overwriting each other.
function examResultsPathFor(startedAt) {
  const stamp = new Date(startedAt || Date.now()).toISOString().slice(0, 19).replace(/:/g, "-");
  return path.join(__dirname, `exam-results-${stamp}.json`);
}

function listExamResultsFiles() {
  return fs.readdirSync(__dirname)
    .filter((name) => /^exam-results-.+\.json$/.test(name))
    .sort();
}

function readCaptures() {
  try {
    const parsed = JSON.parse(fs.readFileSync(capturesPath, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCaptures(captures) {
  fs.writeFileSync(capturesPath, `${JSON.stringify(captures, null, 2)}\n`);
}

function writeExamResults(scope, run) {
  const quizzes = (run.results || []).filter((item) => item.type === "quiz");
  const report = {
    generatedAt: new Date().toISOString(),
    scope,
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
    exams: quizzes.map((item) => ({
      title: item.title,
      module: item.module,
      passed: item.passed,
      status: item.status,
      identified: item.identified !== false,
      // `threshold` is the site's own completionScore; without it a "failed"
      // score cannot be told apart from a merely imperfect one.
      score: { correct: item.correct, total: item.graded, percentage: item.percentage, threshold: item.threshold },
      errors: item.errors || []
    })),
    processingErrors: (run.results || []).filter((item) => item.status === "failed" && item.type !== "quiz")
  };
  const target = examResultsPathFor(run.startedAt);
  fs.writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`);
  return { ...report, file: path.basename(target) };
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
]);

app.get("/api/exams", (_req, res) => {
  res.json(
    Object.entries(exams).map(([id, exam]) => ({
      id,
      name: exam.name,
      questionCount: exam.questions.length,
      section: chapterWiseEssentials.has(id) ? "Chapter Wise Essentials" : "Core Exams"
    }))
  );
});

app.get("/api/status", async (_req, res) => {
  res.json(await browserStatus());
});

app.get("/api/logs", (_req, res) => {
  res.json({ logs: getLogs() });
});

app.get("/api/detect", async (_req, res) => {
  try {
    res.json(await detectCurrentExam());
  } catch (error) {
    res.status(404).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.get("/api/captures", (_req, res) => {
  const captures = readCaptures();
  res.json({ count: captures.length, captures });
});

app.get("/api/captures/download", (_req, res) => {
  if (!fs.existsSync(capturesPath)) writeCaptures([]);
  res.download(capturesPath, "captured-exams.json");
});

app.get("/api/results", (_req, res) => {
  const files = listExamResultsFiles().reverse();
  res.json({ count: files.length, files });
});

app.get("/api/results/download", (req, res) => {
  const noResults = {
    error: "No graded exam results are available yet. Run Complete Chapter or Complete For You first."
  };
  const requested = typeof req.query.file === "string" ? path.basename(req.query.file) : null;
  const files = listExamResultsFiles();
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

app.post("/api/capture", async (_req, res) => {
  try {
    const capture = await captureCurrentExam();
    // Keep the capture file fresh: each identification replaces the previous exam.
    writeCaptures([capture]);
    res.json({ capture, count: 1, replaced: true });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.delete("/api/captures", (_req, res) => {
  writeCaptures([]);
  res.json({ count: 0 });
});

app.post("/api/connect", async (_req, res) => {
  try {
    res.json(await connectBrowser());
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post("/api/chapter/run", async (req, res) => {
  try {
    const { skipCompleted = true, limit = 0 } = req.body || {};
    const run = await processCurrentChapter({
      skipCompleted: Boolean(skipCompleted),
      limit: Number(limit) || 0,
      // Flush after each item so an interrupted run keeps what it finished.
      onProgress: (progress) => writeExamResults("chapter", progress)
    });
    const report = writeExamResults("chapter", run);
    res.json({ ...run, report });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post("/api/for-you/run", async (req, res) => {
  try {
    const { skipCompleted = true, limit = 0 } = req.body || {};
    const run = await processForYou({
      skipCompleted: Boolean(skipCompleted),
      limit: Number(limit) || 0,
      // Flush after each item so an interrupted run keeps what it finished.
      onProgress: (progress) => writeExamResults("for-you", progress)
    });
    const report = writeExamResults("for-you", run);
    res.json({ ...run, report });
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
    res.json(await runExam(examId, Boolean(dryRun), { immediate: true }));
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

const port = process.env.PORT || 3030;
app.listen(port, () => {
  console.log(`Apple Exam Runner: http://localhost:${port}`);
});
