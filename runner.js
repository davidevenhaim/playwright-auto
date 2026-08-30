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
  const deadline = Date.now() + MODULE_READY_TIMEOUT_MS;
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
    if (questionVisible) break;

    // The reading copy of a module renders seconds before its quiz is fetched,
    // so "this frame has text" is not a signal that the questions have arrived.
    // Ask the player instead, and only stop early once it has settled.
    const state = await moduleAssessmentState(targetPage);
    if (state?.hasAssessments === false) break;
    if (state?.hasAssessments === true && state.questions > 0) break;
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

// Sales Coach marks a finished item with a `.completed-task` badge in its card
// and appends ", completed" to the link's aria-label. Read both so the runner
// can leave finished work alone.
async function collectChapterItems(chapterPage) {
  const items = [];
  for (const frame of chapterPage.frames()) {
    const frameItems = await frame.evaluate(() => {
      const tidy = (value = "") => String(value).replace(/\s+/g, " ").trim();
      return Array.from(document.querySelectorAll('a[href*="/home/content/view/"]')).map((anchor) => {
        const card = anchor.closest(".entity") || anchor.parentElement;
        const aria = tidy(anchor.getAttribute("aria-label"));
        return {
          url: anchor.href,
          title: tidy(card?.querySelector(".entity-title")?.textContent) || tidy(anchor.innerText) || aria,
          completed: Boolean(card?.querySelector(".completed-task")) || /,\s*completed$/i.test(aria)
        };
      });
    }).catch(() => []);
    items.push(...frameItems);
  }

  const unique = new Map();
  for (const item of items) {
    const url = item.url.split("#")[0];
    // The same module is often linked twice with different `backTo` values.
    const id = url.match(/\/home\/content\/view\/(\d+)/)?.[1] || url;
    const existing = unique.get(id);
    if (!existing) unique.set(id, { ...item, id, url });
    else if (item.completed) existing.completed = true;
  }
  return [...unique.values()];
}

async function readChapterProgress(chapterPage) {
  const text = clean(await chapterPage.locator("body").innerText().catch(() => ""));
  const match = text.match(/(\d+)\s+completed\D{0,40}?(\d+)\s+required/i);
  return match ? { completed: Number(match[1]), required: Number(match[2]) } : null;
}

// Every Sales Coach module runs inside Apple's SEED content player, which keeps
// its own state on `window.SeedInterface` in the package iframe:
//
//   hasAssessments === true   the module ends in a quiz, and the server marks
//                             the module complete when that quiz is submitted
//   hasAssessments === false  plain reading material, which the player completes
//                             once it sees its own window scrolled to 70%
//
// The flag is set as soon as the player boots, well before the quiz HTML is
// fetched and rendered. Reading it is what keeps a slow-loading quiz from being
// mistaken for reading material.
const MODULE_READY_TIMEOUT_MS = 120000;
const SCROLL_PERCENT_REQUIRED_FOR_COMPLETION = 0.7;

async function readPlayerState(frame) {
  return frame.evaluate(() => {
    if (typeof SeedInterface === "undefined") return null;
    return {
      hasAssessments: SeedInterface.hasAssessments,
      questions: document.querySelectorAll(".question").length,
      submitButtons: document.querySelectorAll(".submitAssessmentButton").length,
      textLength: (document.body?.innerText || "").length
    };
  }).catch(() => null);
}

async function moduleAssessmentState(targetPage) {
  for (const frame of targetPage.frames()) {
    const state = await readPlayerState(frame);
    if (state) return state;
  }
  return null;
}

async function waitForModuleReady(targetPage, timeoutMs = MODULE_READY_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  let questionsSeenAt = null;

  while (Date.now() < deadline) {
    for (const frame of targetPage.frames()) {
      const state = await readPlayerState(frame);
      if (!state) continue;
      last = { frame, ...state };
      if (state.hasAssessments === true && state.questions > 0) {
        if (state.submitButtons > 0) return last;
        // A quiz whose answers are already recorded renders without a Submit
        // button; give it a moment to appear, then carry on without it.
        if (questionsSeenAt === null) questionsSeenAt = Date.now();
        if (Date.now() - questionsSeenAt > 15000) return last;
      }
      if (state.hasAssessments === false && state.textLength > 0) return last;
    }
    await targetPage.waitForTimeout(500);
  }

  return last;
}

// The player decides completion from the scroll position of its own window, so
// the scrolling has to happen inside the package iframe, and each step has to
// stand still longer than jQuery's 250 ms `scrollstop` latency.
async function completeReadingResource(targetPage, frame) {
  const geometry = await frame.evaluate(() => ({
    docHeight: document.documentElement.scrollHeight,
    winHeight: innerHeight
  })).catch(() => null);
  if (!geometry) return false;

  if (geometry.docHeight * SCROLL_PERCENT_REQUIRED_FOR_COMPLETION <= geometry.winHeight) {
    log("Reading page fits its window; the player completes it on load.");
    await targetPage.waitForTimeout(3000);
    return true;
  }

  const steps = 8;
  for (let step = 1; step <= steps; step++) {
    await frame.evaluate((fraction) => {
      const root = document.scrollingElement || document.documentElement;
      window.scrollTo(0, Math.max(0, root.scrollHeight - innerHeight) * fraction);
    }, step / steps).catch(() => {});
    await targetPage.waitForTimeout(900);
  }

  const reached = await frame.evaluate(() => {
    const root = document.scrollingElement || document.documentElement;
    const scrollable = root.scrollHeight - innerHeight;
    return scrollable <= 0 ? 1 : root.scrollTop / scrollable;
  }).catch(() => 0);

  log(`Scrolled reading material to ${Math.round(reached * 100)}% (70% is what completes it).`);
  return reached >= SCROLL_PERCENT_REQUIRED_FOR_COMPLETION;
}

// A click on Submit proves nothing: the player blocks the button while any
// question is unanswered, and only marks the questions correct or incorrect
// once the server has graded the attempt. Wait for that grade.
async function submitAssessment(targetPage, frame) {
  // The player leaves its "you still have questions to answer" banner in the
  // DOM and merely hides it, and innerText still reports text for a hidden
  // element, so a status message only counts when it is actually rendered.
  const inspect = () => frame.evaluate(() => {
    const jq = window.jQuery || window.$;
    const button = document.querySelector(".submitAssessmentButton");
    const statusElement = document.querySelector(".submitStatusMessage");
    const statusRect = statusElement?.getBoundingClientRect();
    const statusShown = Boolean(statusElement) && statusRect.height > 0 &&
      getComputedStyle(statusElement).display !== "none" &&
      getComputedStyle(statusElement).visibility !== "hidden";

    let built = null;
    let submitted = false;
    try {
      for (const element of document.querySelectorAll("[assessmentId]")) {
        const assessment = SeedInterface.QSP?.getAssessmentWithID?.(element.getAttribute("assessmentId"));
        if (assessment?.hasSubmitted) submitted = true;
      }
      if (jq && SeedInterface.QSP?.buildReturnJSON) {
        const result = SeedInterface.QSP.buildReturnJSON(jq("form[assessmentId]").first());
        built = { unanswered: result.$unansweredQuestions.length, answers: result.postObj.answers.length };
      }
    } catch {}

    const incorrectQuestions = Array.from(document.querySelectorAll(".question_incorrect"))
      .map((element) => element.closest(".question") || element)
      .filter((element, index, all) => all.indexOf(element) === index)
      .map((question) => {
        const tidy = (value = "") => String(value).replace(/\s+/g, " ").trim();
        const heading = question.querySelector(
          ".questionText, .question_text, .question-title, .question_title, legend, h1, h2, h3, h4"
        );
        const selectedAnswers = Array.from(question.querySelectorAll('input[type="radio"]:checked, input[type="checkbox"]:checked'))
          .map((input) => {
            const label = input.labels?.[0] || question.querySelector(`label[for="${CSS.escape(input.id || "")}"]`);
            return tidy(label?.innerText || input.value);
          })
          .filter(Boolean);
        const feedback = Array.from(question.querySelectorAll(
          '[class*="feedback"], [class*="incorrect"], [class*="explanation"], [class*="rationale"]'
        ))
          .filter((node) => node !== question && node.getBoundingClientRect().height > 0)
          .map((node) => tidy(node.innerText))
          .filter(Boolean);
        // Every option with its state, so a wrong entry in exams.js can be
        // corrected from the report without reopening the quiz.
        const options = Array.from(question.querySelectorAll('input[type="radio"], input[type="checkbox"]'))
          .map((input) => {
            const label = input.labels?.[0] ||
              question.querySelector(`label[for="${CSS.escape(input.id || "unmatched")}"]`);
            const row = label?.closest("[class]") || label;
            return {
              text: tidy(label?.innerText || input.value),
              selected: input.checked,
              classes: tidy(row?.className)
            };
          })
          .filter((option) => option.text)
          .slice(0, 12);

        return {
          question: tidy(heading?.innerText || question.innerText).slice(0, 1000),
          selectedAnswers,
          options,
          feedback: [...new Set(feedback)].slice(0, 10)
        };
      });

    let completionScore = null;
    try {
      const score = SeedInterface.QSP?.completionScore;
      if (Number.isFinite(score)) completionScore = score;
    } catch {}

    return {
      completionScore,
      hasButton: Boolean(button),
      disabled: Boolean(button?.classList.contains("disabled")),
      unanswered: document.querySelectorAll(".question.unanswered").length,
      status: statusShown ? (statusElement.innerText || "").replace(/\s+/g, " ").trim() : "",
      graded: document.querySelectorAll(".question_correct, .question_incorrect").length,
      correct: document.querySelectorAll(".question_correct").length,
      total: document.querySelectorAll(".question").length,
      submitted,
      built,
      incorrectQuestions
    };
  }).catch(() => null);

  const before = await inspect();
  if (!before) throw new Error("The quiz frame went away before it could be submitted.");
  if (before.built) log(`Pre-flight: ${before.built.answers} answers built, ${before.built.unanswered} unanswered.`);
  if (before.built && before.built.unanswered > 0) {
    throw new Error(`${before.built.unanswered} question(s) are still unanswered; not submitting.`);
  }

  if (!before.hasButton) {
    // Answers are posted to the server as they are selected, so a quiz can
    // finish without a Submit button ever being present.
    log("No Submit button on this quiz; its answers are already recorded with the server.");
    return { ...before, submittedWithoutButton: true };
  }
  if (before.disabled || before.unanswered > 0) {
    throw new Error(`The quiz Submit button is disabled${before.unanswered ? ` (${before.unanswered} unanswered)` : ""}.`);
  }

  await frame.locator(".submitAssessmentButton").first().click({ force: true });
  log("Clicked Submit.");

  const deadline = Date.now() + 90000;
  let submittedSince = null;

  while (Date.now() < deadline) {
    await targetPage.waitForTimeout(1000);
    const result = await inspect();
    if (!result) break;

    if (result.graded > 0) {
      log(`Quiz graded by the server: ${result.correct}/${result.total} correct.`);
      return result;
    }
    // The player flags the attempt as submitted before it marks each question
    // correct or incorrect, so give those classes a few seconds to land instead
    // of reporting a graded attempt with no per-question detail.
    if (result.submitted) {
      if (submittedSince === null) submittedSince = Date.now();
      if (Date.now() - submittedSince > 15000) {
        log("Quiz recorded as submitted, but the server returned no per-question grading.");
        return result;
      }
    }
    if (result.status) throw new Error(`The quiz was rejected: ${result.status}`);
  }

  throw new Error("Submit was clicked, but the server never returned a graded attempt.");
}

async function openModule(itemPage, url) {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await itemPage.goto(url, { waitUntil: "domcontentloaded", timeout: EXAM_LOAD_TIMEOUT_MS });
      await itemPage.bringToFront().catch(() => {});
      await itemPage.waitForTimeout(1500);
      return;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message.split("\n")[0] : String(error);
      log(`Navigation attempt ${attempt} of 3 failed: ${message}`);
      await itemPage.waitForTimeout(3000 * attempt);
    }
  }
  throw lastError;
}

function randomDelay(minSeconds, maxSeconds) {
  return Math.floor((minSeconds + Math.random() * (maxSeconds - minSeconds + 1)) * 1000);
}

async function waitRandom(targetPage, minSeconds, maxSeconds, reason) {
  const delay = randomDelay(minSeconds, maxSeconds);
  log(`${reason}: waiting ${Math.round(delay / 1000)} seconds.`);
  await targetPage.waitForTimeout(delay);
}

async function openAllAccordions(targetPage) {
  let opened = 0;
  for (let pass = 0; pass < 3; pass++) {
    let openedThisPass = 0;
    for (const frame of targetPage.frames()) {
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
      if (!initial) {
        log(`Video ${index + 1} could not be started; continuing without it.`);
        continue;
      }

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
        if (!state) break;
        if (state.ended || (Number.isFinite(state.duration) && state.currentTime >= state.duration - 0.25)) break;
        await targetPage.waitForTimeout(1000);
      }

      const ended = await video.evaluate((element) => element.ended ||
        (Number.isFinite(element.duration) && element.currentTime >= element.duration - 0.25)).catch(() => false);
      // Videos are not what registers completion, so a video that stalls or is
      // torn down by the page must not take the whole module down with it.
      log(ended ? `Video ${played} finished.` : `Video ${played} did not finish; continuing anyway.`);
    }
  }

  if (!played) log("No videos found on this reading page.");
  return played;
}

export async function processCurrentChapter({ skipCompleted = true, limit = 0, onProgress = null } = {}) {
  const startedAt = new Date();
  const chapterPage = await connectedPage();
  logs = [];
  log(`Scanning chapter page: ${await chapterPage.title().catch(() => chapterPage.url())}`);
  // Academy chapters hide some module links behind expandable resource
  // sections. Expand them before collecting links so every module is visited.
  await openAllAccordions(chapterPage);
  await chapterPage.waitForTimeout(1000);

  const before = await readChapterProgress(chapterPage);
  if (before) log(`Progress before this run: ${before.completed} of ${before.required} required items.`);

  const allItems = await collectChapterItems(chapterPage);
  if (!allItems.length) {
    throw new Error("No chapter resources were found. Open the chapter page that lists its exams and resources, then try again.");
  }

  const completedCount = allItems.filter((item) => item.completed).length;
  const pending = skipCompleted ? allItems.filter((item) => !item.completed) : allItems;
  const items = limit > 0 ? pending.slice(0, limit) : pending;
  log(`Found ${allItems.length} chapter items: ${completedCount} already completed, ${pending.length} pending.`);
  if (limit > 0 && pending.length > items.length) log(`Limited to the first ${items.length} pending items.`);

  const results = [];
  let examsFilled = 0;
  let examsSubmitted = 0;
  let resourcesRead = 0;
  let failed = 0;

  const snapshot = () => ({
    startedAt: startedAt.toISOString(),
    total: allItems.length,
    skipped: skipCompleted ? completedCount : 0,
    pending: pending.length,
    processed: results.length,
    examsFilled,
    examsSubmitted,
    resourcesRead,
    failed,
    results: [...results]
  });

  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    let itemPage = null;
    // Remembered so a quiz that fails before grading is still reported as an
    // exam result rather than a generic processing error.
    let quizName = null;
    let isQuizModule = false;
    try {
      if (index > 0) await waitRandom(chapterPage, 1, 3, "Between modules");
      log(`[${index + 1}/${items.length}] Opening ${item.title || item.url}`);
      itemPage = await context.newPage();
      page = itemPage;
      await openModule(itemPage, item.url);

      const ready = await waitForModuleReady(itemPage);
      if (!ready) throw new Error("The SEED content player never loaded for this module.");

      await openAllAccordions(itemPage).catch(() => {});
      await playAllVideos(itemPage).catch((error) => {
        log(`Video playback skipped: ${error instanceof Error ? error.message : String(error)}`);
      });

      isQuizModule = Boolean(ready.hasAssessments);

      if (ready.hasAssessments) {
        if (!ready.questions) {
          throw new Error("This module has a quiz, but its questions never rendered. It may be locked or out of attempts.");
        }
        const detected = await detectCurrentExam();
        quizName = detected.name;
        if (!detected.matchedQuestions) {
          throw new Error(`No stored answers match this quiz; "${detected.name}" was the closest by title. Capture it and add it to exams.js.`);
        }
        const run = await runExam(detected.id, false, { preserveLogs: true });
        examsFilled++;
        if (run.failed > 0) {
          throw new Error(`Quiz not submitted because ${run.failed} of ${run.total} questions failed to fill.`);
        }
        await waitRandom(itemPage, 3, 8, "Before submitting the quiz");
        const graded = await submitAssessment(itemPage, ready.frame);
        examsSubmitted++;
        // Sales Coach quizzes pass on a threshold (completionScore, 80 on the
        // WISE modules), not on a perfect score. A quiz whose answers were
        // already recorded server-side comes back ungraded, which is not a fail.
        const percentage = graded.total > 0 ? Math.round((graded.correct / graded.total) * 100) : null;
        // WISE quizzes use an 80% pass threshold. Some packages omit
        // completionScore from their runtime state even though the results UI
        // still applies that threshold, so do not incorrectly require 100%.
        const threshold = Number.isFinite(graded.completionScore) ? graded.completionScore : 80;
        const passed = percentage === null
          ? null
          : percentage >= threshold;

        results.push({
          title: detected.name,
          module: item.title,
          type: "quiz",
          status: passed === null ? "recorded" : (passed ? "passed" : "failed"),
          passed,
          correct: graded.correct,
          graded: graded.total,
          percentage,
          threshold,
          errors: graded.incorrectQuestions || [],
          ...run
        });
        if (passed === false) {
          log(`Answer key is wrong for "${detected.name}": scored ${percentage}%, needs ${threshold}%.`);
        }
      } else {
        log("Module is reading material; scrolling it to the player's completion threshold.");
        const scrolledEnough = await completeReadingResource(itemPage, ready.frame);
        resourcesRead++;
        results.push({
          title: item.title || await itemPage.title(),
          type: "resource",
          status: scrolledEnough ? "read" : "partially read"
        });
      }

      // Completion is reported to the server from the page; give that call time
      // to leave before the tab goes away.
      await itemPage.waitForTimeout(1500);
      await itemPage.close();
      itemPage = null;
    } catch (error) {
      failed++;
      const message = error instanceof Error ? error.message : String(error);
      log(`Failed: ${item.title || item.url}: ${message}`);
      // Every quiz module belongs in the report, including the ones that never
      // reached grading, so a whole chapter's answer problems land in one file.
      results.push((quizName || isQuizModule)
        ? {
            title: quizName || item.title || item.url,
            module: item.title,
            type: "quiz",
            status: "failed",
            passed: false,
            identified: Boolean(quizName),
            errors: [{ reason: message }],
            error: message
          }
        : { title: item.title || item.url, status: "failed", error: message });
      if (itemPage && !itemPage.isClosed()) await itemPage.close().catch(() => {});
    }

    // Write after every item so an interrupted run still leaves a usable file.
    if (onProgress) {
      try {
        onProgress(snapshot());
      } catch (error) {
        log(`Could not write the results file: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  page = chapterPage;
  await chapterPage.bringToFront().catch(() => {});

  // Only the chapter page can confirm what actually registered, so reload it and
  // report the real numbers rather than what the runner thinks it did.
  await chapterPage.reload({ waitUntil: "domcontentloaded", timeout: EXAM_LOAD_TIMEOUT_MS }).catch(() => {});
  await chapterPage.waitForTimeout(2500);
  const after = await readChapterProgress(chapterPage);
  const stillIncomplete = (await collectChapterItems(chapterPage)).filter((entry) => !entry.completed);

  log(`Chapter run finished: ${examsSubmitted} quizzes submitted, ${resourcesRead} resources read, ${failed} failed.`);
  if (after) {
    const gained = before ? after.completed - before.completed : null;
    log(`Progress after this run: ${after.completed} of ${after.required} required items${gained === null ? "" : ` (${gained >= 0 ? "+" : ""}${gained})`}.`);
  }
  if (stillIncomplete.length) {
    log(`Still incomplete (${stillIncomplete.length}): ${stillIncomplete.map((entry) => entry.title).join(", ")}`);
  }

  return {
    startedAt: startedAt.toISOString(),
    total: allItems.length,
    skipped: skipCompleted ? completedCount : 0,
    pending: pending.length,
    processed: items.length,
    examsFilled,
    examsSubmitted,
    resourcesRead,
    failed,
    progressBefore: before,
    progressAfter: after,
    stillIncomplete: stillIncomplete.map((entry) => entry.title),
    results
  };
}

export async function processForYou({ skipCompleted = true, limit = 0, onProgress = null } = {}) {
  const targetPage = await connectedPage();
  let opened = false;
  for (const frame of targetPage.frames()) {
    const tab = frame.getByText("For You", { exact: true }).first();
    if (await tab.count().catch(() => 0) && await tab.isVisible().catch(() => false)) {
      await tab.click({ force: true });
      opened = true;
      break;
    }
  }
  if (!opened) throw new Error("Could not find the For You tab in the connected browser.");
  await targetPage.waitForTimeout(2000);
  return processCurrentChapter({ skipCompleted, limit, onProgress });
}

export async function captureCurrentExam() {
  const targetPage = await connectedPage();
  // Capturing must work for exams that are not in exams.js yet. Wait on the
  // SEED player's own assessment state instead of trying to identify a known
  // question or taking a one-time snapshot before a slow quiz has rendered.
  await waitForModuleReady(targetPage, 60000).catch(() => null);

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
      const controlVisible = (element) => {
        if (visible(element)) return true;
        const labels = element.labels ? Array.from(element.labels) : [];
        return labels.some(visible) || Boolean(element.closest("label") && visible(element.closest("label")));
      };

      const controls = Array.from(document.querySelectorAll(
        'input[type="radio"], input[type="checkbox"], select, [role="combobox"]'
      )).filter(controlVisible).map((element, index) => {
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
  const hasExamControls = capturedFrames.some((frame) => frame.controls?.length > 0);
  if (!hasExamControls) {
    throw new Error("Could not capture an exam. Open the exam questions in the connected tab first.");
  }
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

// Each option renders as a 1x1 `input` followed by a sibling `label[for=...]`,
// so the input has to be resolved through the `for` attribute rather than found
// inside the label.
async function optionRows(block) {
  const labels = block.locator("label");
  const count = await labels.count();
  const rows = [];

  for (let index = 0; index < count; index++) {
    const label = labels.nth(index);
    const text = clean(await label.innerText().catch(() => ""));
    if (!text) continue;

    let input = label.locator('input[type="checkbox"], input[type="radio"]').first();
    if (!(await input.count().catch(() => 0))) {
      const forId = await label.getAttribute("for").catch(() => null);
      input = forId ? block.locator(`input[id="${forId}"]`).first() : null;
      if (input && !(await input.count().catch(() => 0))) input = null;
    }
    rows.push({ label, text, input });
  }
  return rows;
}

// Clicking a label toggles it, so every click has to be conditional. Re-clicking
// an answer that an earlier attempt already saved would clear it, and the quiz
// would then be rejected as unanswered.
async function applyAnswers(block, answers, { exclusive = false, delayMs = 200 } = {}) {
  const wanted = answers.map((answer) => clean(answer));
  const rows = await optionRows(block);
  if (!rows.length) return chooseOptionByText(block, answers, delayMs);

  const matched = new Set();
  const plan = rows.map((row) => {
    const hit = wanted.find((answer) => row.text === answer) ||
      wanted.find((answer) => !rows.some((candidate) => candidate.text === answer) && row.text.includes(answer));
    if (hit) matched.add(hit);
    return { row, shouldSelect: Boolean(hit) };
  });

  const missing = wanted.filter((answer) => !matched.has(answer));
  if (missing.length) throw new Error(`Option not found: ${missing.join(" | ")}`);

  // Clear stale selections first: a "select three" question refuses new
  // selections while a previous attempt still holds the limit.
  const ordered = exclusive
    ? [...plan.filter((entry) => !entry.shouldSelect), ...plan.filter((entry) => entry.shouldSelect)]
    : plan.filter((entry) => entry.shouldSelect);

  for (const entry of ordered) {
    const { input, label } = entry.row;
    if (input) {
      const selected = await input.isChecked().catch(() => false);
      if (selected === entry.shouldSelect) continue;
    } else if (!entry.shouldSelect) {
      continue;
    }
    await label.click({ force: true });
    if (delayMs > 0) await block.page().waitForTimeout(delayMs);
  }

  for (const entry of plan) {
    if (!entry.row.input) continue;
    const selected = await entry.row.input.isChecked().catch(() => false);
    if (selected !== entry.shouldSelect) {
      throw new Error(`Could not ${entry.shouldSelect ? "select" : "clear"} option: ${entry.row.text.slice(0, 70)}`);
    }
  }
}

// Fallback for quizzes that do not use `label` elements for their options.
async function chooseOptionByText(block, answers, delayMs = 200) {
  for (const answer of answers) {
    let answerText = block.getByText(answer, { exact: true }).first();
    if (!(await answerText.count())) answerText = block.getByText(answer, { exact: false }).first();
    if (!(await answerText.count())) throw new Error(`Option not found: ${answer}`);

    const row = answerText.locator("xpath=ancestor::*[.//input[@type='checkbox' or @type='radio']][1]");
    const input = (await row.count()) ? row.locator("input[type=checkbox], input[type=radio]").first() : null;
    if (input && (await input.count())) {
      if (!(await input.isChecked().catch(() => false))) await input.check({ force: true });
    } else {
      await answerText.click({ force: true });
    }
    if (delayMs > 0) await block.page().waitForTimeout(delayMs);
  }
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

async function answerSelectQuestion(block, frame, answers, delayMs = 200) {
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
    if (delayMs > 0) await frame.page().waitForTimeout(delayMs);
  }
}

async function fillQuestion(question, dryRun = false, { immediate = false } = {}) {
  const { block, frame } = await findQuestionBlock(question.match);
  await block.scrollIntoViewIfNeeded();
  const delayMs = immediate ? 0 : 200;

  if (dryRun) {
    log(`DRY RUN matched: ${question.match}`);
    return;
  }

  if (question.type === "single") {
    await applyAnswers(block, [question.answer], { delayMs });
    log(`✓ ${question.match} -> ${question.answer}`);
    return;
  }

  if (question.type === "multiple") {
    await applyAnswers(block, question.answers, { exclusive: true, delayMs });
    log(`✓ ${question.match} -> ${question.answers.join(" | ")}`);
    return;
  }

  if (question.type === "selects") {
    await answerSelectQuestion(block, frame, question.answers, delayMs);
    log(`✓ ${question.match}`);
  }
}

export async function runExam(examId, dryRun = false, { preserveLogs = false, immediate = false } = {}) {
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
      if (!immediate && success + failed > 0) await targetPage.waitForTimeout(randomDelay(2, 5));
      await fillQuestion(q, dryRun, { immediate });
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
