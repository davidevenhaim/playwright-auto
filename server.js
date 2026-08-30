import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exams } from "./exams.js";
import { captureCurrentExam, connectBrowser, browserStatus, detectCurrentExam, getLogs, runExam } from "./runner.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const capturesPath = path.join(__dirname, "captured-exams.json");

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
  "work-order-management-essentials"
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

app.post("/api/capture", async (_req, res) => {
  try {
    const capture = await captureCurrentExam();
    const captures = readCaptures();
    const duplicateIndex = captures.findIndex((item) => item.title === capture.title);
    if (duplicateIndex >= 0) captures[duplicateIndex] = capture;
    else captures.push(capture);
    writeCaptures(captures);
    res.json({ capture, count: captures.length, replaced: duplicateIndex >= 0 });
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

app.post("/api/run", async (req, res) => {
  try {
    const { examId, dryRun = false } = req.body || {};
    if (!examId) return res.status(400).json({ error: "examId is required" });
    res.json(await runExam(examId, Boolean(dryRun)));
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

const port = process.env.PORT || 3030;
app.listen(port, () => {
  console.log(`Apple Exam Runner: http://localhost:${port}`);
});
