import { chromium } from "playwright";
import { exams } from "./exams.js";

let context = null;
let page = null;
let logs = [];
const EXAM_LOAD_TIMEOUT_MS = 60000;

function log(message) {
  const line = `[${new Date().toLocaleTimeString()}] ${message}`;
  logs.push(line);
  if (logs.length > 500) logs = logs.slice(-500);
  console.log(line);
}

function clean(text = "") {
  return String(text)
    .normalize("NFKC")
    .replace(/[\u00a0\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isBlankPage(candidate) {
  return candidate.url() === "about:blank" || candidate.url().startsWith("chrome://newtab");
}

async function connectedPage() {
  if (!context) throw new Error("Connect a browser tab first.");

  if (page && !page.isClosed()) return page;

  const pages = context.pages();
  page = pages.findLast((candidate) => !candidate.isClosed()) || null;
  if (!page) throw new Error("The connected tab was closed. Click Connect tab again.");
  return page;
}

export function getLogs() {
  return logs;
}

export async function connectBrowser() {
  if (context) {
    try {
      if (!page || page.isClosed()) page = await context.newPage();
      await page.bringToFront();
      log("Connected tab is ready. Navigate to the exam in this tab, then click Fill exam.");
      return { connected: true, url: page.url() };
    } catch {
      context = null;
      page = null;
    }
  }

  context = await chromium.launchPersistentContext("./apple-playwright-profile", {
    headless: false,
    viewport: { width: 1440, height: 1000 }
  });

  const pages = context.pages();
  page = pages.find((candidate) => !isBlankPage(candidate)) || pages[0] || await context.newPage();
  await page.bringToFront();

  log("Tab connected. Log into Apple and navigate to the exam in this tab.");
  return { connected: true, url: page.url() };
}

export async function browserStatus() {
  if (!context || !page || page.isClosed()) return { connected: false };
  try {
    return {
      connected: true,
      url: page.url(),
      title: await page.title()
    };
  } catch {
    return { connected: false };
  }
}

export async function detectCurrentExam() {
  const targetPage = await connectedPage();
  const deadline = Date.now() + EXAM_LOAD_TIMEOUT_MS;
  let visibleText = "";

  while (Date.now() < deadline) {
    const frameTexts = await Promise.all(targetPage.frames().map((frame) =>
      frame.locator("body").innerText().catch(() => "")
    ));
    visibleText = clean(frameTexts.join(" ")).toLocaleLowerCase();
    const questionVisible = Object.values(exams).some((exam) =>
      exam.questions.some((question) =>
        visibleText.includes(clean(question.match).toLocaleLowerCase())
      )
    );
    const loadedContentFrame = frameTexts.some((text) => clean(text).length > 500);

    if (questionVisible || (loadedContentFrame && !visibleText.includes(" loading"))) break;
    await targetPage.waitForTimeout(500);
  }

  const pageTitle = clean(await targetPage.title().catch(() => "")).toLocaleLowerCase();
  const candidates = Object.entries(exams).map(([id, exam]) => {
    const matchedQuestions = exam.questions.filter((question) =>
      visibleText.includes(clean(question.match).toLocaleLowerCase())
    ).length;
    const titleMatched = pageTitle.includes(clean(exam.name).toLocaleLowerCase()) ||
      visibleText.includes(clean(exam.name).toLocaleLowerCase());
    return {
      id,
      name: exam.name,
      matchedQuestions,
      totalQuestions: exam.questions.length,
      titleMatched,
      score: matchedQuestions * 100 + (titleMatched ? 10 : 0)
    };
  }).sort((a, b) => b.score - a.score || b.matchedQuestions - a.matchedQuestions);

  const best = candidates[0];
  if (!best || best.score === 0) {
    throw new Error("Could not identify this exam. Make sure the exam questions are visible in the connected tab.");
  }

  const tied = candidates.filter((candidate) => candidate.score === best.score);
  if (tied.length > 1 && best.matchedQuestions === 0) {
    throw new Error(`Exam title is ambiguous: ${tied.map((candidate) => candidate.name).join(", ")}`);
  }

  log(`Detected exam: "${best.name}" (${best.matchedQuestions}/${best.totalQuestions} question matches).`);
  return best;
}

async function collectChapterItems(chapterPage) {
  const items = [];
  for (const frame of chapterPage.frames()) {
    const frameItems = await frame.evaluate(() => Array.from(document.querySelectorAll("a[href]"))
      .map((anchor) => ({
        url: anchor.href,
        title: (anchor.innerText || anchor.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim()
      }))
      .filter((item) => item.url.includes("/home/content/view/")))
      .catch(() => []);
    items.push(...frameItems);
  }

  const unique = new Map();
  for (const item of items) {
    const canonicalUrl = item.url.split("#")[0];
    if (!unique.has(canonicalUrl)) unique.set(canonicalUrl, { ...item, url: canonicalUrl });
  }
  return [...unique.values()];
}

async function scrollResource(resourcePage, durationMs = 8000) {
  const steps = Math.max(8, Math.ceil(durationMs / 500));
  for (let step = 1; step <= steps; step++) {
    for (const frame of resourcePage.frames()) {
      await frame.evaluate(({ step, steps }) => {
        const root = document.scrollingElement || document.documentElement;
        const maximum = Math.max(0, root.scrollHeight - innerHeight);
        scrollTo({ top: maximum * (step / steps), behavior: "smooth" });
      }, { step, steps }).catch(() => {});
    }
    await resourcePage.waitForTimeout(500);
  }
}

function randomDelay(minSeconds, maxSeconds) {
  return Math.floor((minSeconds + Math.random() * (maxSeconds - minSeconds + 1)) * 1000);
}

async function waitRandom(targetPage, minSeconds, maxSeconds, reason) {
  const delay = randomDelay(minSeconds, maxSeconds);
  log(`${reason}: waiting ${Math.round(delay / 1000)} seconds.`);
  await targetPage.waitForTimeout(delay);
}

async function clickExactAction(targetPage, names, { childFramesOnly = false } = {}) {
  for (const frame of targetPage.frames()) {
    if (childFramesOnly && frame === targetPage.mainFrame()) continue;
    const candidates = frame.locator('button, input[type="button"], input[type="submit"], [role="button"]');
    const count = await candidates.count().catch(() => 0);
    for (let index = 0; index < count; index++) {
      const candidate = candidates.nth(index);
      if (!(await candidate.isVisible().catch(() => false))) continue;
      if (!(await candidate.isEnabled().catch(() => false))) continue;
      const label = clean(
        await candidate.innerText().catch(() => "") ||
        await candidate.getAttribute("value").catch(() => "") ||
        await candidate.getAttribute("aria-label").catch(() => "")
      );
      if (!names.some((name) => label.toLocaleLowerCase() === name.toLocaleLowerCase())) continue;
      await candidate.click({ force: true });
      return label;
    }
  }
  return null;
}

async function submitCurrentExam(targetPage) {
  const clicked = await clickExactAction(targetPage, ["Submit", "שלח"]);
  if (!clicked) throw new Error("The exam was filled, but its Submit button was not found or enabled.");
  log(`Clicked ${clicked}.`);
  await targetPage.waitForTimeout(3000);
}

async function advanceModulePage(targetPage) {
  const clicked = await clickExactAction(
    targetPage,
    ["Next", "Continue", "הבא", "המשך"],
    { childFramesOnly: true }
  );
  if (!clicked) return false;
  log(`Clicked ${clicked} to advance within the module.`);
  await targetPage.waitForTimeout(1500);
  return true;
}

async function openAllAccordions(targetPage) {
  let opened = 0;
  for (let pass = 0; pass < 3; pass++) {
    let openedThisPass = 0;
    for (const frame of targetPage.frames()) {
      if (frame === targetPage.mainFrame()) continue;

      openedThisPass += await frame.evaluate(() => {
        let count = 0;
        for (const details of document.querySelectorAll("details:not([open])")) {
          details.open = true;
          count++;
        }
        return count;
      }).catch(() => 0);

      const toggles = frame.locator('[aria-expanded="false"]');
      const count = await toggles.count().catch(() => 0);
      for (let index = 0; index < count; index++) {
        const toggle = toggles.nth(index);
        if (!(await toggle.isVisible().catch(() => false))) continue;
        if (!(await toggle.isEnabled().catch(() => false))) continue;
        await toggle.click({ force: true }).catch(() => {});
        openedThisPass++;
        await targetPage.waitForTimeout(150);
      }
    }
    opened += openedThisPass;
    if (!openedThisPass) break;
  }
  if (opened) log(`Opened ${opened} accordion section${opened === 1 ? "" : "s"}.`);
}

async function startVisibleVideoControls(targetPage) {
  for (const frame of targetPage.frames()) {
    if (frame === targetPage.mainFrame()) continue;
    const buttons = frame.locator('button, [role="button"]');
    const count = await buttons.count().catch(() => 0);
    for (let index = 0; index < count; index++) {
      const button = buttons.nth(index);
      if (!(await button.isVisible().catch(() => false))) continue;
      const label = clean(
        await button.getAttribute("aria-label").catch(() => "") ||
        await button.getAttribute("title").catch(() => "") ||
        await button.innerText().catch(() => "")
      );
      if (!/^(play|play video|הפעל|נגן)$/i.test(label)) continue;
      await button.click({ force: true }).catch(() => {});
      await targetPage.waitForTimeout(500);
    }
  }
}

async function playAllVideos(targetPage) {
  const initialVideoCount = (await Promise.all(targetPage.frames().map((frame) =>
    frame === targetPage.mainFrame() ? 0 : frame.locator("video").count().catch(() => 0)
  ))).reduce((total, count) => total + count, 0);
  if (!initialVideoCount) await startVisibleVideoControls(targetPage);
  let played = 0;

  for (const frame of targetPage.frames()) {
    if (frame === targetPage.mainFrame()) continue;
    const videos = frame.locator("video");
    const count = await videos.count().catch(() => 0);

    for (let index = 0; index < count; index++) {
      const video = videos.nth(index);
      await video.scrollIntoViewIfNeeded().catch(() => {});
      const initial = await video.evaluate(async (element) => {
        if (element.ended) element.currentTime = 0;
        try {
          await element.play();
        } catch {
          element.muted = true;
          await element.play();
        }
        return { duration: element.duration, currentTime: element.currentTime };
      }).catch(() => null);
      if (!initial) throw new Error(`Video ${index + 1} could not be started.`);

      played++;
      const durationText = Number.isFinite(initial.duration) ? `${Math.ceil(initial.duration)} seconds` : "unknown duration";
      log(`Playing video ${played} (${durationText}) and waiting for it to end.`);
      const maximumWait = Number.isFinite(initial.duration)
        ? Math.max(120000, (initial.duration - initial.currentTime + 120) * 1000)
        : 4 * 60 * 60 * 1000;
      const deadline = Date.now() + maximumWait;

      while (Date.now() < deadline) {
        const state = await video.evaluate(async (element) => {
          if (element.paused && !element.ended) await element.play().catch(() => {});
          return { ended: element.ended, currentTime: element.currentTime, duration: element.duration };
        }).catch(() => null);
        if (!state) throw new Error(`Video ${played} disappeared before it ended.`);
        if (state.ended || (Number.isFinite(state.duration) && state.currentTime >= state.duration - 0.25)) break;
        await targetPage.waitForTimeout(1000);
      }

      const ended = await video.evaluate((element) => element.ended ||
        (Number.isFinite(element.duration) && element.currentTime >= element.duration - 0.25)).catch(() => false);
      if (!ended) throw new Error(`Video ${played} did not finish before the safety timeout.`);
      log(`Video ${played} finished.`);
    }
  }

  if (!played) log("No videos found on this reading page.");
  return played;
}

export async function processCurrentChapter() {
  const chapterPage = await connectedPage();
  logs = [];
  log(`Scanning chapter page: ${await chapterPage.title().catch(() => chapterPage.url())}`);
  const items = await collectChapterItems(chapterPage);
  if (!items.length) {
    throw new Error("No chapter resources were found. Open the chapter page that lists its exams and resources, then try again.");
  }

  log(`Found ${items.length} linked chapter item${items.length === 1 ? "" : "s"}.`);
  const results = [];
  let examsFilled = 0;
  let examsSubmitted = 0;
  let resourcesRead = 0;
  let failed = 0;

  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    let itemPage = null;
    try {
      if (index > 0) await waitRandom(chapterPage, 3, 12, "Between modules");
      log(`[${index + 1}/${items.length}] Opening ${item.title || item.url}`);
      itemPage = await context.newPage();
      page = itemPage;
      await itemPage.goto(item.url, { waitUntil: "domcontentloaded", timeout: EXAM_LOAD_TIMEOUT_MS });
      await itemPage.waitForTimeout(1500);

      let moduleFinished = false;
      let pagesRead = 0;
      for (let modulePage = 0; modulePage < 50 && !moduleFinished; modulePage++) {
        let detected = null;
        try {
          detected = await detectCurrentExam();
        } catch {}

        if (detected && detected.matchedQuestions > 0) {
          const run = await runExam(detected.id, false, { preserveLogs: true });
          examsFilled++;
          if (run.failed > 0) {
            throw new Error(`Exam was not submitted because ${run.failed} of ${run.total} questions failed to fill.`);
          }
          log("Exam filled. Waiting 35 seconds before submission.");
          await itemPage.waitForTimeout(35000);
          await submitCurrentExam(itemPage);
          examsSubmitted++;
          results.push({ title: detected.name, type: "exam", status: "submitted", ...run });
          moduleFinished = !(await advanceModulePage(itemPage));
        } else {
          await openAllAccordions(itemPage);
          await playAllVideos(itemPage);
          log(`Module page ${modulePage + 1} is reading material. Reading for 20 seconds.`);
          await scrollResource(itemPage, 20000);
          await openAllAccordions(itemPage);
          pagesRead++;
          moduleFinished = !(await advanceModulePage(itemPage));
        }
      }

      if (pagesRead > 0) {
        resourcesRead++;
        results.push({ title: item.title || await itemPage.title(), type: "resource", status: "read", pagesRead });
      }
      await itemPage.close();
      itemPage = null;
    } catch (error) {
      failed++;
      const message = error instanceof Error ? error.message : String(error);
      log(`Failed: ${item.title || item.url}: ${message}`);
      results.push({ title: item.title || item.url, status: "failed", error: message });
      if (itemPage && !itemPage.isClosed()) await itemPage.close().catch(() => {});
    }
  }

  page = chapterPage;
  await chapterPage.bringToFront().catch(() => {});
  log(`Chapter complete: ${examsSubmitted} exams submitted, ${resourcesRead} resources read, ${failed} failed.`);
  return { total: items.length, examsFilled, examsSubmitted, resourcesRead, failed, results };
}

export async function captureCurrentExam() {
  const targetPage = await connectedPage();
  await targetPage.waitForTimeout(500);

  const capturedFrames = [];
  for (const frame of targetPage.frames()) {
    const capture = await frame.evaluate(() => {
      const tidy = (value = "") => String(value).replace(/\s+/g, " ").trim();
      const visible = (element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      };
      const labelFor = (element) => {
        const labels = element.labels ? Array.from(element.labels) : [];
        if (labels.length) return tidy(labels.map((label) => label.innerText).join(" "));
        const labelledBy = element.getAttribute("aria-labelledby");
        if (labelledBy) {
          const text = labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.innerText || "").join(" ");
          if (tidy(text)) return tidy(text);
        }
        return tidy(element.getAttribute("aria-label") || element.closest("label")?.innerText || "");
      };

      const controls = Array.from(document.querySelectorAll(
        'input[type="radio"], input[type="checkbox"], select, [role="combobox"]'
      )).filter(visible).map((element, index) => {
        const tag = element.tagName.toLowerCase();
        const type = tag === "input" ? element.type : (tag === "select" ? "select" : "combobox");
        const options = tag === "select"
          ? Array.from(element.options).map((option) => tidy(option.textContent)).filter(Boolean)
          : [];
        return {
          index,
          type,
          label: labelFor(element),
          name: element.getAttribute("name") || "",
          value: element.getAttribute("value") || "",
          options
        };
      });

      return {
        url: location.href,
        text: tidy(document.body?.innerText || ""),
        controls
      };
    }).catch(() => null);

    if (capture?.text || capture?.controls?.length) {
      capturedFrames.push({ name: frame.name(), ...capture });
    }
  }

  const result = {
    title: clean(await targetPage.title().catch(() => "Untitled exam")),
    url: targetPage.url(),
    capturedAt: new Date().toISOString(),
    frames: capturedFrames
  };
  log(`Captured "${result.title}" (${capturedFrames.length} frame${capturedFrames.length === 1 ? "" : "s"}).`);
  return result;
}

async function findQuestionBlock(questionText) {
  const targetPage = await connectedPage();
  const wanted = clean(questionText);
  let questionNode = null;
  let questionFrame = null;
  const deadline = Date.now() + EXAM_LOAD_TIMEOUT_MS;

  // Sales Coach renders quiz content in an iframe. Search every frame in the
  // connected tab and keep polling briefly while a newly navigated exam loads.
  while (!questionNode && Date.now() < deadline) {
    for (const frame of targetPage.frames()) {
      const textMatches = frame.getByText(questionText, { exact: false });
      const count = await textMatches.count().catch(() => 0);

      for (let i = 0; i < count; i++) {
        const candidate = textMatches.nth(i);
        if (!(await candidate.isVisible().catch(() => false))) continue;
        const text = clean(await candidate.innerText().catch(() => ""));
        if (!text.includes(wanted)) continue;
        if (!questionNode || text.length < questionNode.textLength) {
          questionNode = { locator: candidate, textLength: text.length };
          questionFrame = frame;
        }
      }
    }

    if (!questionNode) await targetPage.waitForTimeout(200);
  }

  if (!questionNode || !questionFrame) {
    throw new Error(`Question not visible in any frame: ${questionText}`);
  }
  const exactText = questionNode.locator;

  const xpaths = [
    "xpath=ancestor::*[.//input[@type='checkbox' or @type='radio']][1]",
    "xpath=ancestor::*[.//select][1]",
    "xpath=ancestor::*[.//*[@role='combobox']][1]",
    "xpath=ancestor::*[self::div or self::section][1]"
  ];

  for (const xpath of xpaths) {
    const candidate = exactText.locator(xpath);
    if (await candidate.count()) return { block: candidate, frame: questionFrame };
  }

  throw new Error(`Question container not found: ${questionText}`);
}

async function chooseInputOption(block, answer) {
  const labels = block.locator("label");
  const labelCount = await labels.count();

  for (let i = 0; i < labelCount; i++) {
    const label = labels.nth(i);
    const text = clean(await label.innerText().catch(() => ""));
    if (text.includes(clean(answer))) {
      const input = label.locator("input[type=checkbox], input[type=radio]").first();
      if (await input.count()) {
        if (!(await input.isChecked())) await input.check({ force: true });
        return;
      }
      await label.click({ force: true });
      return;
    }
  }

  const answerText = block.getByText(answer, { exact: false }).first();
  if (await answerText.count()) {
    const row = answerText.locator(
      "xpath=ancestor::*[.//input[@type='checkbox' or @type='radio']][1]"
    );
    if (await row.count()) {
      const input = row.locator("input[type=checkbox], input[type=radio]").first();
      if (await input.count()) {
        if (!(await input.isChecked())) await input.check({ force: true });
        return;
      }
    }
    await answerText.click({ force: true });
    return;
  }

  throw new Error(`Option not found: ${answer}`);
}

async function chooseSelect(select, answer) {
  try {
    await select.selectOption({ label: answer });
    return true;
  } catch {}

  const options = select.locator("option");
  const count = await options.count();

  for (let i = 0; i < count; i++) {
    const option = options.nth(i);
    const text = clean(await option.innerText().catch(() => ""));
    if (text === clean(answer) || text.includes(clean(answer))) {
      const value = await option.getAttribute("value");
      if (value != null) {
        await select.selectOption(value);
        return true;
      }
    }
  }
  return false;
}

async function answerSelectQuestion(block, frame, answers) {
  const nativeSelects = block.locator("select");
  if ((await nativeSelects.count()) >= answers.length) {
    for (let i = 0; i < answers.length; i++) {
      const ok = await chooseSelect(nativeSelects.nth(i), answers[i]);
      if (!ok) throw new Error(`Could not select "${answers[i]}"`);
      log(`Dropdown ${i + 1}: ${answers[i]}`);
    }
    return;
  }

  let comboboxes = block.locator('[role="combobox"]');
  let count = await comboboxes.count();

  if (count < answers.length) {
    comboboxes = block.locator("button");
    count = await comboboxes.count();
  }

  if (count < answers.length) {
    throw new Error(`Expected ${answers.length} dropdowns; found ${count}`);
  }

  for (let i = 0; i < answers.length; i++) {
    await comboboxes.nth(i).click({ force: true });
    const roleOption = frame.getByRole("option", { name: answers[i], exact: true });
    if (await roleOption.count()) {
      await roleOption.last().click({ force: true });
    } else {
      const textOption = frame.getByText(answers[i], { exact: true });
      if (!(await textOption.count())) throw new Error(`Dropdown option not found: ${answers[i]}`);
      await textOption.last().click({ force: true });
    }
    log(`Dropdown ${i + 1}: ${answers[i]}`);
    await frame.page().waitForTimeout(200);
  }
}

async function fillQuestion(question, dryRun = false) {
  const { block, frame } = await findQuestionBlock(question.match);
  await block.scrollIntoViewIfNeeded();

  if (dryRun) {
    log(`DRY RUN matched: ${question.match}`);
    return;
  }

  if (question.type === "single") {
    await chooseInputOption(block, question.answer);
    log(`✓ ${question.match} -> ${question.answer}`);
    return;
  }

  if (question.type === "multiple") {
    for (const answer of question.answers) {
      await chooseInputOption(block, answer);
    }
    log(`✓ ${question.match} -> ${question.answers.join(" | ")}`);
    return;
  }

  if (question.type === "selects") {
    await answerSelectQuestion(block, frame, question.answers);
    log(`✓ ${question.match}`);
  }
}

export async function runExam(examId, dryRun = false, { preserveLogs = false } = {}) {
  const targetPage = await connectedPage();

  const exam = exams[examId];
  if (!exam) throw new Error(`Unknown exam: ${examId}`);

  if (!preserveLogs) logs = [];
  log(`Starting "${exam.name}"${dryRun ? " (dry run)" : ""}`);
  log(`Using connected tab: ${await targetPage.title().catch(() => targetPage.url())}`);
  log("Matching questions by their text; rendered question order is ignored.");

  let success = 0;
  let failed = 0;

  for (const q of exam.questions) {
    try {
      await fillQuestion(q, dryRun);
      success++;
    } catch (error) {
      failed++;
      log(`✗ ${q.match}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  log(`Done. ${success} succeeded, ${failed} failed.`);
  log("Final submission was NOT clicked. Review the exam in the browser.");

  return { success, failed, total: exam.questions.length };
}
