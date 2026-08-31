import { chromium } from "playwright";
import { AsyncLocalStorage } from "node:async_hooks";
import { exams } from "./exams.js";

// Every run belongs to a session, and a session is a whole browser of its own:
// its own Chromium profile directory, its own window and its own log. Two
// sessions are two separate logins, so several accounts can be worked through
// side by side without sharing a cookie jar.
const sessions = new Map();
const activeSession = new AsyncLocalStorage();
const DEFAULT_SESSION = "1";
const EXAM_LOAD_TIMEOUT_MS = 60000;

export function sessionId(raw) {
  const id = String(raw ?? "").trim().replace(/[^A-Za-z0-9_-]/g, "-");
  return id || DEFAULT_SESSION;
}

// Session 1 keeps the original profile directory, so the login that is already
// there survives the move to multiple sessions.
export function sessionProfileDir(id) {
  return id === DEFAULT_SESSION ? "./apple-playwright-profile" : `./apple-playwright-profile-${id}`;
}

export function getSession(raw = DEFAULT_SESSION) {
  const id = sessionId(raw);
  if (!sessions.has(id)) {
    sessions.set(id, { id, context: null, page: null, logs: [], index: sessions.size });
  }
  return sessions.get(id);
}

// Runs are long-lived and interleave, so the active session cannot be a single
// module-level variable: it travels with the async call tree instead. Every
// server request runs its handler inside one of these.
export function withSession(raw, fn) {
  return activeSession.run(getSession(raw), fn);
}

function session() {
  return activeSession.getStore() || getSession();
}

export function listSessions() {
  return [...sessions.values()].map((entry) => ({
    id: entry.id,
    connected: Boolean(entry.context && entry.page && !entry.page.isClosed()),
    url: entry.context && entry.page && !entry.page.isClosed() ? entry.page.url() : null,
    profile: sessionProfileDir(entry.id)
  }));
}

function log(message) {
  const current = session();
  const line = `[${new Date().toLocaleTimeString()}] ${message}`;
  current.logs.push(line);
  if (current.logs.length > 500) current.logs = current.logs.slice(-500);
  console.log(`[session ${current.id}] ${line}`);
}

function resetLogs() {
  session().logs = [];
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
  const current = session();
  if (!current.context) throw new Error("Connect a browser tab first.");

  if (current.page && !current.page.isClosed()) return current.page;

  const pages = current.context.pages();
  current.page = pages.findLast((candidate) => !candidate.isClosed()) || null;
  if (!current.page) throw new Error("The connected tab was closed. Click Connect tab again.");
  return current.page;
}

export function getLogs() {
  return session().logs;
}

export async function connectBrowser() {
  const current = session();

  if (current.context) {
    try {
      if (!current.page || current.page.isClosed()) current.page = await current.context.newPage();
      await current.page.bringToFront();
      log("Connected tab is ready. Navigate to the exam in this tab, then click Fill exam.");
      return { connected: true, session: current.id, url: current.page.url() };
    } catch {
      current.context = null;
      current.page = null;
    }
  }

  // Each session gets its own window, offset so two of them do not land exactly
  // on top of each other, and its own user-data directory, which is what keeps
  // the accounts apart.
  const offset = current.index * 48;
  current.context = await chromium.launchPersistentContext(sessionProfileDir(current.id), {
    headless: false,
    viewport: { width: 1440, height: 1000 },
    args: [`--window-position=${40 + offset},${40 + offset}`, "--window-size=1460,1040"]
  });
  current.context.on("close", () => {
    current.context = null;
    current.page = null;
  });

  const pages = current.context.pages();
  current.page = pages.find((candidate) => !isBlankPage(candidate)) || pages[0] || await current.context.newPage();
  if (isBlankPage(current.page)) {
    await current.page.goto("https://salescoach.apple.com/home/for-you", {
      waitUntil: "domcontentloaded",
      timeout: EXAM_LOAD_TIMEOUT_MS
    }).catch((error) => {
      log(`Could not open Sales Coach automatically: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
    });
  }
  await current.page.bringToFront();

  log(`Session ${current.id} connected (profile ${sessionProfileDir(current.id)}). Log into Apple in this window and navigate to the exam.`);
  return { connected: true, session: current.id, url: current.page.url() };
}

export async function browserStatus() {
  const current = session();
  if (!current.context || !current.page || current.page.isClosed()) return { connected: false, session: current.id };
  try {
    return {
      connected: true,
      session: current.id,
      url: current.page.url(),
      title: await current.page.title()
    };
  } catch {
    return { connected: false, session: current.id };
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
//
// The Academy is a tree, not a flat list. The program page lists chapters, a
// chapter lists collections, and only a collection lists the modules that open
// the SEED content player. A module is the only node whose URL is
// /home/content/view/<id>; every other card carrying its own completion state
// is a container the runner has to walk into to reach the modules underneath.
// Collecting only module links is why an earlier run of the Academy page found
// a single item and stopped.
export async function collectNodes(targetPage) {
  const collected = [];

  for (const frame of targetPage.frames()) {
    const frameNodes = await frame.evaluate(() => {
      const tidy = (value = "") => String(value).replace(/\s+/g, " ").trim();
      const MODULE_URL = /\/home\/content\/view\/(\d+)/;

      // "4/7 completed" and "1 completed ... 3 required" count a whole card
      // list, so they have to come out before a single card's own text is
      // searched for a completion word.
      const withoutCounters = (text) =>
        text.replace(/\d+\s*(?:\/\s*\d+)?\s*(?:completed|required)/gi, " ");

      const visible = (element) => {
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return false;
        const style = getComputedStyle(element);
        return style.display !== "none" && style.visibility !== "hidden";
      };

      // The row that owns this link. Anything holding more than a handful of
      // links is a list rather than a row, and its furniture must not be read
      // as this one item's state.
      const cardOf = (anchor) => {
        const candidates = [
          anchor.closest(".entity"),
          anchor.closest("[role='listitem']"),
          anchor.closest("li"),
          anchor.closest("[class*='card' i]"),
          anchor.parentElement,
          anchor
        ];
        for (const candidate of candidates) {
          if (candidate && candidate.querySelectorAll("a[href]").length <= 4) return candidate;
        }
        return anchor;
      };

      const isCompleted = (anchor, card) => {
        const aria = tidy(anchor.getAttribute("aria-label"));
        if (/,\s*completed\b/i.test(aria)) return true;
        if (card.querySelector(".completed-task, [class*='completed' i], [data-testid*='completed' i]")) return true;
        const text = tidy(card.innerText);
        if (text.length < 400 && /\bcompleted\b|הושלם/i.test(withoutCounters(text))) return true;
        const bar = card.querySelector('[role="progressbar"][aria-valuenow]');
        if (bar) {
          const now = Number(bar.getAttribute("aria-valuenow"));
          const max = Number(bar.getAttribute("aria-valuemax") || 100);
          if (Number.isFinite(now) && Number.isFinite(max) && max > 0 && now >= max) return true;
        }
        return false;
      };

      const isLocked = (anchor, card) => {
        const aria = tidy(anchor.getAttribute("aria-label"));
        if (/\blocked\b/i.test(aria) || /נעול/.test(aria)) return true;
        if (anchor.getAttribute("aria-disabled") === "true") return true;
        return Boolean(card.querySelector("[class*='lock' i], [data-testid*='lock' i], [aria-label*='lock' i]"));
      };

      // A chapter card and a breadcrumb can share the same /home/ URL shape, so
      // a URL pattern alone decides nothing. What marks a card as a container is
      // the learning-item furniture on the row itself — its own progress bar,
      // completion badge, lock or "Collection" kind label.
      const STATE_SIGNALS = ["progress-bar", "completion-badge", "lock", "aria-completed", "kind-label"];

      const containerEvidence = (anchor, card) => {
        const reasons = [];
        const text = tidy(card.innerText);
        if (card.querySelector('[role="progressbar"], progress, [class*="progress" i]')) reasons.push("progress-bar");
        if (card.querySelector(".completed-task, [class*='completed' i]")) reasons.push("completion-badge");
        if (card.querySelector("[class*='lock' i], [aria-label*='lock' i]")) reasons.push("lock");
        if (/,\s*completed\b/i.test(tidy(anchor.getAttribute("aria-label")))) reasons.push("aria-completed");
        if (/^(collection|course|chapter|program|series|path|module)\b/i.test(text)) reasons.push("kind-label");
        if (/\d+\s*(?:\/\s*\d+)?\s*(?:completed|required)/i.test(text)) reasons.push("counter");
        if (/\/home\/(collection|course|chapter|program|curriculum|journey|learningplan|learning-plan|path|plan|series|topic)\//i.test(anchor.href)) {
          reasons.push("container-url");
        }
        return reasons;
      };

      // Site chrome: a breadcrumb back to the parent and the tab bar both link
      // into /home/ and neither is content to walk into.
      const isChrome = (anchor) => Boolean(
        anchor.closest('nav, footer, [role="navigation"], [role="banner"], [class*="breadcrumb" i]')
      );

      // The chapter that is merely open — no badge, no bar, just a chevron —
      // carries no state of its own, and it is exactly the one the walk must
      // not miss. What identifies it is its siblings: it is one of a row of
      // links sharing a URL shape. A lone link of that shape, like "View Your
      // Journey" in the page header, is not.
      const shapeOf = (url) => {
        try {
          return new URL(url).pathname.replace(/\d+/g, "#");
        } catch {
          return url;
        }
      };

      const titleOf = (anchor, card) =>
        tidy(card.querySelector(".entity-title")?.textContent) ||
        tidy(card.querySelector("[class*='title' i], h1, h2, h3, h4")?.textContent) ||
        tidy(anchor.innerText) ||
        tidy(anchor.getAttribute("aria-label")) ||
        tidy(card.innerText).slice(0, 120);

      const here = location.href.split("#")[0];
      const results = [];
      const candidates = [];
      const shapeUrls = new Map();

      for (const anchor of document.querySelectorAll("a[href]")) {
        const href = anchor.href;
        if (!href.startsWith(location.origin)) continue;
        const url = href.split("#")[0];
        const card = cardOf(anchor);
        const module = url.match(MODULE_URL);

        if (module) {
          results.push({
            kind: "module",
            id: `module:${module[1]}`,
            url,
            title: titleOf(anchor, card),
            completed: isCompleted(anchor, card),
            locked: isLocked(anchor, card),
            evidence: ["module-url"]
          });
          continue;
        }

        if (url === here) continue;
        if (!/\/home\//.test(url)) continue;
        if (!visible(anchor)) continue;
        if (isChrome(anchor)) continue;

        const evidence = containerEvidence(anchor, card);
        if (!evidence.length) continue;

        const shape = shapeOf(url);
        if (!shapeUrls.has(shape)) shapeUrls.set(shape, new Set());
        shapeUrls.get(shape).add(url);
        candidates.push({ anchor, card, url, shape, evidence });
      }

      for (const candidate of candidates) {
        const { anchor, card, url, shape, evidence } = candidate;
        const siblings = shapeUrls.get(shape).size;
        // A page heading in the card means the card is the page's own header
        // rather than a row in a list.
        const ownState = evidence.some((reason) => STATE_SIGNALS.includes(reason)) && !card.querySelector("h1");
        if (siblings > 1) evidence.push("sibling-group");
        if (!ownState && siblings < 2) continue;

        results.push({
          kind: "container",
          id: `container:${url}`,
          url,
          title: titleOf(anchor, card),
          completed: isCompleted(anchor, card),
          locked: isLocked(anchor, card),
          evidence
        });
      }

      return results;
    }).catch(() => []);

    collected.push(...frameNodes);
  }

  // The same module is often linked twice with different `backTo` values, and a
  // chapter card can appear both in its list and in a "continue where you left
  // off" rail. Merge by identity and keep the most complete reading: completed
  // anywhere means completed, locked only if every copy of it is locked.
  const unique = new Map();
  for (const node of collected) {
    const existing = unique.get(node.id);
    if (!existing) {
      unique.set(node.id, { ...node, evidence: [...node.evidence] });
      continue;
    }
    existing.completed = existing.completed || node.completed;
    existing.locked = existing.locked && node.locked;
    if (!existing.title && node.title) existing.title = node.title;
    for (const reason of node.evidence) {
      if (!existing.evidence.includes(reason)) existing.evidence.push(reason);
    }
  }
  return [...unique.values()];
}

async function collectChapterItems(chapterPage) {
  return (await collectNodes(chapterPage)).filter((node) => node.kind === "module");
}

// The program page counts its chapters as "4/7 completed"; a chapter page
// counts its collections as "1 completed ... 3 required". Either way this
// readout, not the runner's own tally, is what says whether a level is done.
async function readChapterProgress(chapterPage) {
  const text = clean(await chapterPage.locator("body").innerText().catch(() => ""));
  const pair = text.match(/(\d+)\s+completed\D{0,40}?(\d+)\s+required/i);
  if (pair) return { completed: Number(pair[1]), required: Number(pair[2]) };
  const fraction = text.match(/(\d+)\s*\/\s*(\d+)\s+completed/i);
  if (fraction) return { completed: Number(fraction[1]), required: Number(fraction[2]) };
  return null;
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

    // Every question the server graded, not just the wrong ones. A question it
    // marked correct is a confirmed answer key: whatever is selected in it is
    // right, which is what lets a blind run teach exams.js the answers.
    const gradedQuestions = Array.from(document.querySelectorAll(".question")).map((question) => {
      const tidy = (value = "") => String(value).replace(/\s+/g, " ").trim();
      const heading = question.querySelector(
        ".questionText, .question_text, .question-title, .question_title, legend, h1, h2, h3, h4"
      );
      const labelOf = (input) => {
        const label = input.labels?.[0] ||
          question.querySelector(`label[for="${CSS.escape(input.id || "unmatched")}"]`) ||
          input.closest("label");
        return tidy(label?.innerText || input.value);
      };

      const inputs = Array.from(question.querySelectorAll('input[type="radio"], input[type="checkbox"]'));
      const selectedAnswers = inputs.filter((input) => input.checked).map(labelOf).filter(Boolean);
      const feedback = Array.from(question.querySelectorAll(
        '[class*="feedback"], [class*="incorrect"], [class*="explanation"], [class*="rationale"]'
      ))
        .filter((node) => node !== question && node.getBoundingClientRect().height > 0)
        .map((node) => tidy(node.innerText))
        .filter(Boolean);

      // Every option with its state and its row classes. If the player marks
      // the right option after grading, the class is where it shows, so a wrong
      // key can be fixed from the report without reopening the quiz.
      const options = inputs.map((input) => {
        const label = input.labels?.[0] ||
          question.querySelector(`label[for="${CSS.escape(input.id || "unmatched")}"]`) ||
          input.closest("label");
        const row = label?.closest("[class]") || label;
        return {
          text: labelOf(input),
          selected: input.checked,
          classes: tidy(row?.className)
        };
      }).filter((option) => option.text).slice(0, 12);

      const correct = question.classList.contains("question_correct") ||
        Boolean(question.querySelector(".question_correct"));
      const incorrect = question.classList.contains("question_incorrect") ||
        Boolean(question.querySelector(".question_incorrect"));

      const selects = Array.from(question.querySelectorAll("select"))
        .map((select) => tidy(select.options[select.selectedIndex]?.textContent || ""));

      return {
        question: tidy(heading?.innerText || question.innerText).slice(0, 1000),
        state: correct ? "correct" : (incorrect ? "incorrect" : "ungraded"),
        type: selects.length ? "selects" : (inputs.some((i) => i.type === "checkbox") ? "multiple" : "single"),
        selectedAnswers: selects.length ? selects : selectedAnswers,
        options,
        feedback: [...new Set(feedback)].slice(0, 10)
      };
    });

    const incorrectQuestions = gradedQuestions.filter((question) => question.state === "incorrect");

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
      gradedQuestions,
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

// With no stored key, something still has to be selected before the player will
// accept a submission. The picks are deterministic — the first N options the
// question asks for — so a blind run is reproducible, and the graded reply is
// what turns each guess into a real answer for next time.
// What this run has learned so far, keyed by question text. A quiz that failed
// on an earlier pass is re-attempted with every answer the site has since
// confirmed, which is how a fresh account climbs: each attempt settles some
// questions, and the next attempt keeps them and guesses only the rest.
const learnedAnswers = new Map();

function answerKeyOf(questionText) {
  return clean(questionText).replace(/^\d+[\s.)]*/, "").toLocaleLowerCase().slice(0, 80);
}

function rememberLearned(learned) {
  let remembered = 0;
  for (const question of learned.questions || []) {
    if (!question.confirmedAnswers?.length) continue;
    const key = answerKeyOf(question.question);
    if (!key) continue;
    if (!learnedAnswers.has(key)) remembered++;
    learnedAnswers.set(key, question.confirmedAnswers);
  }
  return remembered;
}

export function clearLearnedAnswers() {
  learnedAnswers.clear();
}

async function fillBlindly(frame, known = {}) {
  return frame.evaluate((knownAnswers) => {
    const tidy = (value = "") => String(value).replace(/\s+/g, " ").trim();
    const WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5 };
    const picked = [];

    const labelOf = (input, question) => {
      const label = input.labels?.[0] ||
        question.querySelector(`label[for="${CSS.escape(input.id || "unmatched")}"]`) ||
        input.closest("label");
      return tidy(label?.innerText || input.value);
    };

    const keyOf = (text) => tidy(text).replace(/^\d+[\s.)]*/, "").toLowerCase().slice(0, 80);
    // A confirmed answer captured after a submit carries the site's feedback
    // appended to the option it revealed ("Mac נכון. ..."), so a plain label is
    // also accepted as a whole-word prefix of it. Exact matches are preferred,
    // which keeps "iPhone 15" from swallowing "iPhone 15 Pro".
    const isPrefixAnswer = (labelText, answer) => {
      if (!labelText || !answer || labelText.length < 2) return false;
      const [longer, shorter] = answer.length >= labelText.length ? [answer, labelText] : [labelText, answer];
      return longer.startsWith(shorter) && /[\s.,:;!?]/.test(longer.charAt(shorter.length));
    };
    const knownFor = (question) => {
      const heading = question.querySelector(
        ".questionText, .question_text, .question-title, .question_title, legend, h1, h2, h3, h4"
      );
      for (const source of [heading?.innerText, question.innerText]) {
        const hit = knownAnswers[keyOf(source || "")];
        if (hit?.length) return hit;
      }
      return null;
    };

    for (const question of document.querySelectorAll(".question")) {
      const radios = Array.from(question.querySelectorAll('input[type="radio"]'));
      const boxes = Array.from(question.querySelectorAll('input[type="checkbox"]'));
      const selects = Array.from(question.querySelectorAll("select"));
      const text = tidy(question.innerText);

      // "Select two." and "יש לבחור 2." are the only statement of how many a
      // multiple-choice question wants.
      const asked = text.match(/select\s+(one|two|three|four|five|\d+)/i) || text.match(/יש לבחור\s+(\d+)/);
      const want = asked ? (WORDS[String(asked[1]).toLowerCase()] || Number(asked[1]) || 1) : 1;

      const chosen = [];
      const settled = knownFor(question);

      // Everything this run already knows about this question goes in first;
      // only what is left over is guessed.
      if (settled && (boxes.length || radios.length)) {
        const inputs = boxes.length ? boxes : radios;
        const rows = inputs.map((input) => ({ input, text: labelOf(input, question) }));
        const wanted = new Set();
        for (const answer of settled) {
          const row = rows.find((candidate) => candidate.text === answer) ||
            rows.find((candidate) => isPrefixAnswer(candidate.text, answer));
          if (row) wanted.add(row.input);
        }
        if (wanted.size) {
          for (const input of inputs) {
            const shouldSelect = wanted.has(input);
            if (input.checked !== shouldSelect) input.click();
          }
          picked.push({
            question: tidy((question.querySelector(".questionText, .question_text, .question-title, .question_title, legend, h1, h2, h3, h4") || question).innerText).slice(0, 300),
            chosen: rows.filter((row) => wanted.has(row.input)).map((row) => row.text),
            fromLearned: true
          });
          continue;
        }
      }

      if (selects.length) {
        for (const select of selects) {
          if (select.selectedIndex <= 0 && select.options.length > 1) {
            select.selectedIndex = 1;
            select.dispatchEvent(new Event("change", { bubbles: true }));
          }
          chosen.push(tidy(select.options[select.selectedIndex]?.textContent || ""));
        }
      } else if (boxes.length) {
        const checked = boxes.filter((box) => box.checked);
        if (checked.length !== want) {
          // Clicking a checked box clears it; start from empty so exactly the
          // asked-for number ends up selected.
          for (const box of checked) box.click();
          for (const box of boxes.slice(0, Math.min(want, boxes.length))) box.click();
        }
        chosen.push(...boxes.filter((box) => box.checked).map((box) => labelOf(box, question)));
      } else if (radios.length) {
        if (!radios.some((radio) => radio.checked)) radios[0].click();
        chosen.push(...radios.filter((radio) => radio.checked).map((radio) => labelOf(radio, question)));
      } else {
        continue;
      }

      const heading = question.querySelector(
        ".questionText, .question_text, .question-title, .question_title, legend, h1, h2, h3, h4"
      );
      picked.push({ question: tidy(heading?.innerText || question.innerText).slice(0, 300), chosen });
    }

    return picked;
  }, known);
}

// A question the server marked correct is a confirmed answer: whatever was
// selected in it is right. That is the whole point of a blind run — one attempt
// converts guesses into a key that exams.js can keep.
function learnFromGrading(graded, { exam, module, chapter, url, percentage, threshold }) {
  const questions = (graded.gradedQuestions || []).filter((question) => question.state !== "ungraded");
  if (!questions.length) return null;

  return {
    exam,
    module,
    chapter,
    url,
    score: { correct: graded.correct, total: graded.total, percentage, threshold },
    questions: questions.map((question) => ({
      question: question.question,
      type: question.type,
      state: question.state,
      chose: question.selectedAnswers,
      options: question.options.map((option) => option.text),
      // Only a question the server called correct yields an answer worth
      // keeping. A wrong one still narrows the field, which is why its options
      // and its feedback are recorded too.
      confirmedAnswers: question.state === "correct" ? question.selectedAnswers : null,
      feedback: question.feedback
    }))
  };
}

// Renders what a run learned as an exams.js entry. Questions that were graded
// wrong are written as comments, because a key must not carry an answer the
// server has already rejected.
export function examsJsFromLearned(learned) {
  const id = clean(learned.exam || learned.module || "learned-exam").toLowerCase()
    .replace(/\s*\|.*$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "learned-exam";
  const quote = (value) => `"${String(value).replace(/"/g, "'")}"`;

  const lines = learned.questions.map((question) => {
    const match = clean(question.question).slice(0, 60);
    if (!question.confirmedAnswers) {
      return [
        `      // NOT SOLVED. The server rejected: ${question.chose.join(" | ") || "(nothing)"}`,
        `      // Remaining options: ${question.options.filter((option) => !question.chose.includes(option)).join(" | ")}`,
        `      // { type: ${quote(question.type)}, match: ${quote(match)}, ${question.type === "single" ? 'answer: ""' : 'answers: []'} },`
      ].join("\n");
    }
    if (question.type === "single") {
      return `      { type: "single", match: ${quote(match)}, answer: ${quote(question.confirmedAnswers[0] || "")} },`;
    }
    return `      { type: ${quote(question.type)}, match: ${quote(match)}, answers: [${question.confirmedAnswers.map(quote).join(", ")}] },`;
  });

  const solved = learned.questions.filter((question) => question.confirmedAnswers).length;
  return [
    `  // ${learned.chapter || "?"} / ${learned.module || "?"}`,
    `  // ${learned.url || ""}`,
    `  // Scored ${learned.score.percentage ?? "?"}% — ${solved} of ${learned.questions.length} question(s) confirmed.`,
    `  ${quote(id)}: {`,
    `    name: ${quote(clean(learned.exam || learned.module || id).replace(/\s*\|.*$/, ""))},`,
    "    questions: [",
    lines.join("\n"),
    "    ]",
    "  },"
  ].join("\n");
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

// One run's tally, shared by the flat chapter runner and the Academy walk so
// both write the same report shape and both flush after every module.
function createRunState({ onProgress = null, skipCompleted = true, limit = 0, mode = "run", submitUnverified = false, blind = false } = {}) {
  return {
    startedAt: new Date(),
    onProgress,
    skipCompleted,
    limit,
    // "run" completes modules; "capture" only reads their quizzes and leaves
    // the account's progress alone.
    mode,
    submitUnverified,
    // Answer every quiz even with no stored key, so one attempt reports back
    // what the right answers were.
    blind,
    captures: [],
    learned: [],
    results: [],
    examsFilled: 0,
    examsSubmitted: 0,
    resourcesRead: 0,
    failed: 0,
    skipped: 0,
    total: 0,
    pending: 0,
    modulesProcessed: 0,
    processedModules: new Set(),
    attempts: new Map(),
    retryable: new Map(),
    answersLearned: 0,
    visitedContainers: new Set(),
    deferred: new Map(),
    blocked: 0,
    chapters: new Map()
  };
}

// One row per module. A module that failed and was tried again on a later pass
// replaces its earlier row instead of appearing twice, and the failure tally
// follows it, so the report says where the account actually stands.
function recordResult(state, item, entry) {
  const moduleId = item?.id || null;
  const record = { ...entry, moduleId, attempt: state.attempts.get(moduleId) || 1 };
  const index = moduleId ? state.results.findIndex((existing) => existing.moduleId === moduleId) : -1;
  if (index < 0) {
    state.results.push(record);
    return;
  }
  const previous = state.results[index];
  const wasFailure = previous.status === "failed";
  const isFailure = record.status === "failed";
  if (wasFailure && !isFailure) state.failed = Math.max(0, state.failed - 1);
  state.results[index] = record;
}

// A quiz that did not pass, and a module that broke, are worth another attempt
// later in the same run: by then the run may have confirmed some of its answers.
function markRetryable(state, item) {
  if (!item?.id) return;
  state.retryable.set(item.id, (state.attempts.get(item.id) || 1));
}

function snapshotOf(state, extra = {}) {
  return {
    startedAt: state.startedAt.toISOString(),
    total: state.total,
    skipped: state.skipped,
    pending: state.pending,
    processed: state.results.length,
    examsFilled: state.examsFilled,
    examsSubmitted: state.examsSubmitted,
    resourcesRead: state.resourcesRead,
    failed: state.failed,
    results: [...state.results],
    chapters: [...state.chapters.values()],
    mode: state.mode,
    answersLearned: state.answersLearned || 0,
    captures: [...state.captures],
    learned: [...state.learned],
    ...extra
  };
}

// Write after every item so an interrupted run still leaves a usable file.
function flush(state) {
  if (!state.onProgress) return;
  try {
    state.onProgress(snapshotOf(state));
  } catch (error) {
    log(`Could not write the results file: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function limitReached(state) {
  return state.limit > 0 && state.modulesProcessed >= state.limit;
}

// Open one module in its own tab, play whatever it holds, and either answer its
// quiz or scroll its reading material to the player's completion threshold.
async function processModule(item, state, { label = "", listPage = null } = {}) {
  let itemPage = null;
  // Remembered so a quiz that fails before grading is still reported as an exam
  // result rather than a generic processing error.
  let quizName = null;
  let isQuizModule = false;

  if (item?.id) state.attempts.set(item.id, (state.attempts.get(item.id) || 0) + 1);

  try {
    log(`${label}Opening ${item.title || item.url}`);
    itemPage = await session().context.newPage();
    session().page = itemPage;
    await openModule(itemPage, item.url);

    const ready = await waitForModuleReady(itemPage);
    if (!ready) throw new Error("The SEED content player never loaded for this module.");

    // Accordions hide quiz content, so they are opened either way. Videos are
    // only worth sitting through on a real run: a capture is reading the
    // questions, and waiting out every video to its end would add the whole
    // Academy's running time for nothing.
    await openAllAccordions(itemPage).catch(() => {});
    if (state.mode === "capture") {
      log("Capture mode: not playing this module's videos.");
    } else {
      await playAllVideos(itemPage).catch((error) => {
        log(`Video playback skipped: ${error instanceof Error ? error.message : String(error)}`);
      });
    }

    isQuizModule = Boolean(ready.hasAssessments);

    // Capture mode reads the quiz and stops. It must not answer, must not
    // submit, and must not scroll reading material past the point that would
    // mark it complete, because it is meant to run against an account whose
    // progress should not move.
    if (state.mode === "capture") {
      if (!ready.hasAssessments) {
        log("Reading material; nothing to capture here.");
        recordResult(state, item, {
          title: item.title || item.url,
          chapter: item.chapter || null,
          type: "resource",
          status: "skipped in capture mode"
        });
      } else if (!ready.questions) {
        throw new Error("This module has a quiz, but its questions never rendered.");
      } else {
        const capture = await captureCurrentExam();
        capture.module = item.title;
        capture.chapter = item.chapter || null;
        state.captures.push(capture);
        state.examsFilled++;
        recordResult(state, item, {
          title: capture.title,
          module: item.title,
          chapter: item.chapter || null,
          type: "quiz",
          status: "captured",
          questions: capture.questions.length
        });
      }
      await itemPage.close();
      itemPage = null;
      state.modulesProcessed++;
      if (listPage && !listPage.isClosed()) session().page = listPage;
      flush(state);
      return;
    }

    if (ready.hasAssessments) {
      if (!ready.questions) {
        throw new Error("This module has a quiz, but its questions never rendered. It may be locked or out of attempts.");
      }
      // In blind mode an unknown quiz is the normal case, not an error: it is
      // answered anyway so that its grade reports the key back.
      let detected = null;
      try {
        detected = await detectCurrentExam();
      } catch (error) {
        if (!state.blind) throw error;
        log(`Could not identify this quiz: ${error instanceof Error ? error.message : String(error)}`);
      }

      let run = { success: 0, failed: 0, total: 0, unverified: [] };
      let answeredBlind = false;

      if (detected?.matchedQuestions) {
        quizName = detected.name;
        run = await runExam(detected.id, false, { preserveLogs: true });
        if (run.failed > 0) {
          if (!state.blind) {
            throw new Error(`Quiz not submitted because ${run.failed} of ${run.total} questions failed to fill.`);
          }
          log(`${run.failed} of ${run.total} stored answers would not apply; filling what is left blind.`);
          answeredBlind = true;
        }
      } else if (state.blind) {
        quizName = detected?.name || null;
        answeredBlind = true;
        log("No stored answers for this quiz. Answering it blind so the grade reports the key back.");
      } else {
        throw new Error(`No stored answers match this quiz; "${detected?.name || "nothing"}" was the closest by title. Capture it and add it to exams.js.`);
      }

      if (answeredBlind) {
        const picks = await fillBlindly(ready.frame, Object.fromEntries(learnedAnswers));
        if (!picks.length) throw new Error("Nothing on this quiz could be answered blind.");
        const settled = picks.filter((pick) => pick.fromLearned).length;
        log(`Answered ${picks.length} question(s) blind` +
          (settled ? `, ${settled} of them from answers this run already confirmed.` : "."));
      }
      state.examsFilled++;

      // A guessed answer is not worth an attempt unless the run was told it is.
      // A blind run is exactly that instruction, so it never holds back.
      if (!answeredBlind && run.unverified?.length && !state.submitUnverified) {
        log(`"${detected.name}" is filled but NOT submitted: ${run.unverified.length} answer(s) have never been confirmed.`);
        recordResult(state, item, {
          title: detected.name,
          module: item.title,
          chapter: item.chapter || null,
          type: "quiz",
          status: "filled, awaiting verification",
          passed: null,
          unverified: run.unverified,
          ...run
        });
        await itemPage.waitForTimeout(1500);
        await itemPage.close();
        itemPage = null;
        state.modulesProcessed++;
        if (listPage && !listPage.isClosed()) session().page = listPage;
        flush(state);
        return;
      }

      await waitRandom(itemPage, 3, 8, "Before submitting the quiz");
      const graded = await submitAssessment(itemPage, ready.frame);
      state.examsSubmitted++;
      // Sales Coach quizzes pass on a threshold (completionScore, 80 on the
      // WISE modules), not on a perfect score. A quiz whose answers were
      // already recorded server-side comes back ungraded, which is not a fail.
      const percentage = graded.total > 0 ? Math.round((graded.correct / graded.total) * 100) : null;
      // Some packages omit completionScore from their runtime state even though
      // the results UI still applies the threshold, so do not require 100%.
      const threshold = Number.isFinite(graded.completionScore) ? graded.completionScore : 80;
      const passed = percentage === null ? null : percentage >= threshold;

      // Whatever the server just graded is the best answer key available. Keep
      // it whether the attempt passed or not: a failed attempt still confirms
      // every question it did mark correct.
      const learned = learnFromGrading(graded, {
        exam: quizName || item.title,
        module: item.title,
        chapter: item.chapter || null,
        url: item.url,
        percentage,
        threshold
      });
      if (learned) {
        state.learned.push(learned);
        const solved = learned.questions.filter((question) => question.confirmedAnswers).length;
        const fresh = rememberLearned(learned);
        state.answersLearned = (state.answersLearned || 0) + fresh;
        log(`Learned ${solved} of ${learned.questions.length} answer(s) for "${learned.exam}"` +
          (fresh ? `, ${fresh} of them new to this run.` : "."));
      }

      recordResult(state, item, {
        title: quizName || item.title,
        module: item.title,
        chapter: item.chapter || null,
        type: "quiz",
        status: passed === null ? "recorded" : (passed ? "passed" : "failed"),
        passed,
        correct: graded.correct,
        graded: graded.total,
        percentage,
        threshold,
        errors: graded.incorrectQuestions || [],
        unverified: run.unverified || [],
        answeredBlind,
        ...run
      });
      if (passed === false) {
        markRetryable(state, item);
        // In blind mode this is the expected outcome of a first attempt, not a
        // broken key: the questions it did get right are now confirmed.
        const unsolved = learned
          ? learned.questions.filter((question) => !question.confirmedAnswers).length
          : null;
        log(answeredBlind
          ? `Blind attempt at "${quizName || item.title}" scored ${percentage}% against a ${threshold}% threshold; ${unsolved} question(s) still unsolved.`
          : `Answer key is wrong for "${quizName || item.title}": scored ${percentage}%, needs ${threshold}%.`);
      }
    } else {
      log("Module is reading material; scrolling it to the player's completion threshold.");
      const scrolledEnough = await completeReadingResource(itemPage, ready.frame);
      state.resourcesRead++;
      recordResult(state, item, {
        title: item.title || await itemPage.title(),
        chapter: item.chapter || null,
        type: "resource",
        status: scrolledEnough ? "read" : "partially read"
      });
    }

    // Completion is reported to the server from the page; give that call time to
    // leave before the tab goes away.
    await itemPage.waitForTimeout(1500);
    await itemPage.close();
    itemPage = null;
  } catch (error) {
    state.failed++;
    const message = error instanceof Error ? error.message : String(error);
    log(`Failed: ${item.title || item.url}: ${message}`);
    // Every quiz module belongs in the report, including the ones that never
    // reached grading, so a whole chapter's answer problems land in one file.
    markRetryable(state, item);
    recordResult(state, item, (quizName || isQuizModule)
      ? {
          title: quizName || item.title || item.url,
          module: item.title,
          chapter: item.chapter || null,
          type: "quiz",
          status: "failed",
          passed: false,
          identified: Boolean(quizName),
          errors: [{ reason: message }],
          error: message
        }
      : { title: item.title || item.url, chapter: item.chapter || null, status: "failed", error: message });
    if (itemPage && !itemPage.isClosed()) await itemPage.close().catch(() => {});
  }

  state.modulesProcessed++;
  if (listPage && !listPage.isClosed()) session().page = listPage;
  flush(state);
}

export async function processCurrentChapter({ skipCompleted = true, limit = 0, onProgress = null, submitUnverified = false, blind = false } = {}) {
  const chapterPage = await connectedPage();
  resetLogs();
  const state = createRunState({ onProgress, skipCompleted, limit, submitUnverified, blind });
  log(`Scanning chapter page: ${await chapterPage.title().catch(() => chapterPage.url())}`);
  // Academy chapters hide some module links behind expandable resource
  // sections. Expand them before collecting links so every module is visited.
  await openAllAccordions(chapterPage);
  await chapterPage.waitForTimeout(1000);

  const before = await readChapterProgress(chapterPage);
  if (before) log(`Progress before this run: ${before.completed} of ${before.required} required items.`);

  const allItems = await collectChapterItems(chapterPage);
  if (!allItems.length) {
    const containers = (await collectNodes(chapterPage)).filter((node) => node.kind === "container");
    if (containers.length) {
      throw new Error(`This page lists ${containers.length} sub-section(s), not modules. Use Complete Apple Professional Academy, which walks into them.`);
    }
    throw new Error("No chapter resources were found. Open the chapter page that lists its exams and resources, then try again.");
  }

  const completedCount = allItems.filter((item) => item.completed).length;
  const pending = skipCompleted ? allItems.filter((item) => !item.completed) : allItems;
  const items = limit > 0 ? pending.slice(0, limit) : pending;
  state.total = allItems.length;
  state.skipped = skipCompleted ? completedCount : 0;
  state.pending = pending.length;
  log(`Found ${allItems.length} chapter items: ${completedCount} already completed, ${pending.length} pending.`);
  if (limit > 0 && pending.length > items.length) log(`Limited to the first ${items.length} pending items.`);

  for (let index = 0; index < items.length; index++) {
    if (index > 0) await waitRandom(chapterPage, 1, 3, "Between modules");
    await processModule(items[index], state, {
      label: `[${index + 1}/${items.length}] `,
      listPage: chapterPage
    });
  }

  session().page = chapterPage;
  await chapterPage.bringToFront().catch(() => {});

  // Only the chapter page can confirm what actually registered, so reload it and
  // report the real numbers rather than what the runner thinks it did.
  await chapterPage.reload({ waitUntil: "domcontentloaded", timeout: EXAM_LOAD_TIMEOUT_MS }).catch(() => {});
  await chapterPage.waitForTimeout(2500);
  const after = await readChapterProgress(chapterPage);
  const stillIncomplete = (await collectChapterItems(chapterPage)).filter((entry) => !entry.completed);

  log(`Chapter run finished: ${state.examsSubmitted} quizzes submitted, ${state.resourcesRead} resources read, ${state.failed} failed.`);
  if (after) {
    const gained = before ? after.completed - before.completed : null;
    log(`Progress after this run: ${after.completed} of ${after.required} required items${gained === null ? "" : ` (${gained >= 0 ? "+" : ""}${gained})`}.`);
  }
  if (stillIncomplete.length) {
    log(`Still incomplete (${stillIncomplete.length}): ${stillIncomplete.map((entry) => entry.title).join(", ")}`);
  }

  return snapshotOf(state, {
    processed: items.length,
    progressBefore: before,
    progressAfter: after,
    stillIncomplete: stillIncomplete.map((entry) => entry.title)
  });
}

async function clickVisibleText(targetPage, text, { exact = true } = {}) {
  const selector = exact ? text : new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  for (const frame of targetPage.frames()) {
    const matches = frame.getByText(selector, exact ? { exact: true } : undefined);
    const count = await matches.count().catch(() => 0);
    for (let index = 0; index < count; index++) {
      const match = matches.nth(index);
      if (!(await match.isVisible().catch(() => false))) continue;

      // Prefer the enclosing control/card link. Clicking the text itself is the
      // fallback for React cards whose click handler lives on a plain div.
      const interactive = match.locator(
        'xpath=ancestor-or-self::*[self::a or self::button or @role="button" or @role="link"][1]'
      );
      if (await interactive.count().catch(() => 0)) {
        await interactive.click({ force: true });
      } else {
        await match.click({ force: true });
      }
      return true;
    }
  }
  return false;
}

// The Academy's own cards are React, and their titles are localised, but the
// href behind each card is not. Finding the link and navigating to it is more
// reliable than clicking through a card whose handler lives on a plain div.
async function findLinkMatching(targetPage, needles) {
  const wanted = needles.map((needle) => needle.toLowerCase());
  for (const frame of targetPage.frames()) {
    const found = await frame.evaluate((patterns) => {
      const tidy = (value = "") => String(value).replace(/\s+/g, " ").trim();
      for (const anchor of document.querySelectorAll("a[href]")) {
        if (!anchor.href.startsWith(location.origin)) continue;
        const haystack = [
          tidy(anchor.innerText),
          tidy(anchor.getAttribute("aria-label")),
          tidy(anchor.getAttribute("title"))
        ].join(" ").toLowerCase();
        if (patterns.some((pattern) => haystack.includes(pattern))) {
          return {
            url: anchor.href.split("#")[0],
            title: tidy(anchor.innerText) || tidy(anchor.getAttribute("aria-label"))
          };
        }
      }
      return null;
    }, wanted).catch(() => null);
    if (found) return found;
  }
  return null;
}

// The Academy greys out a chapter that is not open yet and renders it without
// a link, so it never appears among the collected nodes. Counting those rows is
// what tells the run that another pass is worth making once prerequisites are
// finished.
async function countLockedRows(targetPage) {
  let total = 0;
  for (const frame of targetPage.frames()) {
    total += await frame.evaluate(() => {
      // Matched as a word so "block", "clock" and "unlocked" are left alone.
      const LOCK = /(^|[^a-z])lock(ed)?([^a-z]|$)/i;
      const rows = new Set();

      for (const element of document.querySelectorAll("[class], [aria-label], [data-testid]")) {
        const marks = [
          element.getAttribute("class"),
          element.getAttribute("aria-label"),
          element.getAttribute("data-testid")
        ].filter(Boolean).join(" ");
        if (!LOCK.test(marks)) continue;
        const rect = element.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) continue;

        const row = element.closest(".entity, [role='listitem'], li, [class*='row' i], [class*='card' i]") ||
          element.parentElement;
        // A locked row that still links somewhere is reachable and is handled
        // as a deferred node instead.
        if (!row || row.querySelector("a[href]")) continue;
        rows.add(row);
      }

      return rows.size;
    }).catch(() => 0);
  }
  return total;
}

async function openListing(listPage, url) {
  await listPage.goto(url, { waitUntil: "domcontentloaded", timeout: EXAM_LOAD_TIMEOUT_MS });
  await listPage.bringToFront().catch(() => {});
  await listPage.waitForTimeout(1500);
  await openAllAccordions(listPage).catch(() => {});
  await listPage.waitForTimeout(500);
}

async function waitForChapterItems(targetPage, timeoutMs = EXAM_LOAD_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  let nodes = [];
  let renderedSince = null;

  while (Date.now() < deadline) {
    await openAllAccordions(targetPage).catch(() => {});
    nodes = await collectNodes(targetPage);
    if (nodes.length) return nodes;

    // A page that has already painted its own copy and still lists nothing is
    // a leaf, not a slow load. Waiting out the full timeout on every one of
    // those adds up across a whole program.
    const rendered = clean(await targetPage.locator("body").innerText().catch(() => "")).length > 40;
    if (rendered) {
      if (renderedSince === null) renderedSince = Date.now();
      if (Date.now() - renderedSince > 4000) return nodes;
    } else {
      renderedSince = null;
    }
    await targetPage.waitForTimeout(500);
  }
  return nodes;
}

const ACADEMY_NAMES = ["apple professional academy", "professional academy"];
const ACADEMY_MAX_DEPTH = 6;
// A chapter that was locked at the start of the run can open once its
// prerequisites are finished, so the tree is walked again until a whole pass
// adds nothing.
const ACADEMY_MAX_PASSES = 5;

async function openAcademy(listPage) {
  const academyLink = async () => findLinkMatching(listPage, ACADEMY_NAMES);
  const alreadyHere = async () => {
    const text = clean(await listPage.locator("body").innerText().catch(() => "")).toLowerCase();
    if (!ACADEMY_NAMES.some((name) => text.includes(name))) return false;
    return (await collectNodes(listPage)).length > 0;
  };

  let link = await academyLink();
  if (!link && await alreadyHere()) {
    log("The connected tab is already inside the Academy.");
    return { id: `container:${listPage.url().split("#")[0]}`, url: listPage.url().split("#")[0], title: "Apple Professional Academy" };
  }

  if (!link) {
    log("Opening the For You tab to look for Apple Professional Academy.");
    if (await clickVisibleText(listPage, "For You", { exact: false })) {
      await listPage.waitForTimeout(2500);
      link = await academyLink();
    }
  }

  if (!link) {
    // Last resort: click the card itself, for a build that renders the Academy
    // entry as a div with a click handler rather than as a link.
    if (await clickVisibleText(listPage, "Apple Professional Academy", { exact: false })) {
      await listPage.waitForTimeout(2500);
      if (await alreadyHere()) {
        return { id: `container:${listPage.url().split("#")[0]}`, url: listPage.url().split("#")[0], title: "Apple Professional Academy" };
      }
    }
    throw new Error(`Could not find Apple Professional Academy from ${listPage.url()}. Open it in the connected tab and try again.`);
  }

  log(`Opening Apple Professional Academy: ${link.url}`);
  await openListing(listPage, link.url);
  const nodes = await waitForChapterItems(listPage);
  if (!nodes.length) {
    throw new Error("Apple Professional Academy opened, but nothing was listed on it. Wait for the page to finish loading and try again.");
  }
  log(`Apple Professional Academy is ready with ${nodes.length} listed item${nodes.length === 1 ? "" : "s"}.`);
  return { id: `container:${link.url}`, url: link.url, title: link.title || "Apple Professional Academy" };
}

// Depth-first through chapters and collections, running every module it reaches.
async function walkContainer(listPage, container, state, depth = 0) {
  if (state.visitedContainers.has(container.id)) return;
  state.visitedContainers.add(container.id);
  const indent = "  ".repeat(depth);

  if (depth > ACADEMY_MAX_DEPTH) {
    log(`${indent}Not descending past ${ACADEMY_MAX_DEPTH} levels at "${container.title}".`);
    return;
  }
  if (limitReached(state)) return;

  log(`${indent}Entering "${container.title || container.url}".`);
  try {
    await openListing(listPage, container.url);
  } catch (error) {
    log(`${indent}Could not open "${container.title}": ${error instanceof Error ? error.message : String(error)}`);
    return;
  }
  session().page = listPage;

  const progress = await readChapterProgress(listPage);
  if (progress) log(`${indent}"${container.title}": ${progress.completed} of ${progress.required} done.`);

  const blocked = await countLockedRows(listPage);
  if (blocked) {
    state.blocked += blocked;
    log(`${indent}${blocked} row(s) inside "${container.title}" are still locked and carry no link.`);
  }

  const children = await waitForChapterItems(listPage, 20000);
  if (!children.length) {
    log(`${indent}Nothing is listed inside "${container.title}".`);
    return;
  }

  const modules = children.filter((child) => child.kind === "module");
  const subContainers = children.filter((child) => child.kind === "container");
  log(`${indent}${modules.length} module(s) and ${subContainers.length} sub-section(s) inside.`);
  // Keyed by URL so a section walked again on a later pass is updated in place
  // rather than reported twice.
  state.chapters.set(container.url, {
    title: container.title,
    url: container.url,
    depth,
    progress,
    modules: modules.length,
    subSections: subContainers.length
  });

  let index = 0;
  for (const module of modules) {
    if (state.processedModules.has(module.id)) continue;
    if (module.locked) {
      state.deferred.set(module.id, { ...module, chapter: container.title });
      log(`${indent}  Locked for now: "${module.title}".`);
      continue;
    }
    if (state.skipCompleted && module.completed) {
      state.processedModules.add(module.id);
      state.skipped++;
      continue;
    }
    if (limitReached(state)) {
      log(`${indent}Reached the ${state.limit}-module limit for this run.`);
      return;
    }

    state.processedModules.add(module.id);
    state.pending = state.pending + 1;
    if (index > 0) await waitRandom(listPage, 1, 3, "Between modules");
    index++;
    await processModule({ ...module, chapter: container.title }, state, {
      label: `${indent}  [${state.modulesProcessed + 1}] `,
      listPage
    });
    // Each module ran in its own tab; come back to the listing for the next one.
    if (!listPage.isClosed()) {
      await listPage.bringToFront().catch(() => {});
      session().page = listPage;
    }
  }

  for (const child of subContainers) {
    if (limitReached(state)) return;
    if (state.visitedContainers.has(child.id)) continue;
    if (child.locked) {
      state.deferred.set(child.id, { ...child, chapter: container.title });
      log(`${indent}  Locked sub-section for now: "${child.title}".`);
      continue;
    }
    if (state.skipCompleted && child.completed) {
      state.visitedContainers.add(child.id);
      log(`${indent}  Already completed: "${child.title}".`);
      continue;
    }
    // The tab is left inside the child, which does not matter: the next
    // sibling is opened by its own URL rather than by going back.
    await walkContainer(listPage, child, state, depth + 1);
  }
}

export async function processAcademy({ skipCompleted = true, limit = 0, onProgress = null, mode = "run", submitUnverified = false, blind = false } = {}) {
  const listPage = await connectedPage();
  resetLogs();
  const state = createRunState({ onProgress, skipCompleted, limit, mode, submitUnverified, blind });
  if (blind && mode !== "capture") {
    log("Blind mode: every quiz is answered and submitted, and the grades are reported back as an answer key.");
  }
  if (mode === "capture") {
    log("Capture mode: reading every quiz in the Academy without answering or submitting anything.");
  }

  const root = await openAcademy(listPage);
  const before = await readChapterProgress(listPage);
  if (before) log(`Academy progress before this run: ${before.completed} of ${before.required}.`);

  for (let pass = 1; pass <= ACADEMY_MAX_PASSES; pass++) {
    const processedBefore = state.modulesProcessed;
    state.visitedContainers = new Set();
    state.deferred = new Map();
    state.blocked = 0;
    if (pass > 1) log(`Pass ${pass}: re-walking the Academy to pick up anything that unlocked.`);

    await walkContainer(listPage, root, state, 0);

    const gained = state.modulesProcessed - processedBefore;
    const stillShut = state.deferred.size + state.blocked;

    if (limitReached(state)) {
      log(`Stopping: the ${limit}-module limit for this run was reached.`);
      break;
    }
    if (!stillShut) {
      log("Nothing in the Academy is locked any more; the walk is complete.");
      break;
    }
    // Another pass is only worth making if this one finished something that
    // could have opened one of those locks.
    if (!gained) {
      log(`${stillShut} item(s) are still locked and this pass opened nothing; stopping.`);
      break;
    }
    if (pass === ACADEMY_MAX_PASSES) log("Reached the maximum number of passes.");
  }

  await openListing(listPage, root.url).catch(() => {});
  session().page = listPage;
  const after = await readChapterProgress(listPage);

  if (state.mode === "capture") {
    log(`Capture finished: ${state.captures.length} quiz(zes) read, ${state.failed} failed.`);
  } else {
    log(`Academy run finished: ${state.examsSubmitted} quizzes submitted, ${state.resourcesRead} resources read, ${state.failed} failed.`);
    const solved = state.learned.reduce((total, entry) =>
      total + entry.questions.filter((question) => question.confirmedAnswers).length, 0);
    const asked = state.learned.reduce((total, entry) => total + entry.questions.length, 0);
    if (asked) log(`Answer key learned this run: ${solved} of ${asked} question(s) confirmed across ${state.learned.length} quiz(zes).`);
  }
  if (after) {
    const gained = before ? after.completed - before.completed : null;
    log(`Academy progress after this run: ${after.completed} of ${after.required}${gained === null ? "" : ` (${gained >= 0 ? "+" : ""}${gained})`}.`);
  }
  const stillLocked = [...state.deferred.values()].map((node) => node.title);
  if (stillLocked.length) log(`Still locked: ${stillLocked.join(", ")}.`);
  if (state.blocked) log(`${state.blocked} further row(s) are locked and not yet linked.`);

  return snapshotOf(state, {
    total: state.processedModules.size,
    processed: state.modulesProcessed,
    progressBefore: before,
    progressAfter: after,
    chapters: [...state.chapters.values()],
    stillLocked: state.blocked,
    stillIncomplete: stillLocked
  });
}

// Nav destinations that are account tools rather than learning content. The
// walk would find nothing in them and Manage is somebody's admin console.
const SITE_HUB_SKIP = /profile|settings?|account|sign\s?out|log\s?out|manage|alerts?|notifications?|saved|search|help|support|feedback/i;
const SITE_HOME = "https://salescoach.apple.com/home/for-you";
// A fresh account unlocks its way up in stages, so the whole-site walk gets more
// passes than the Academy one, and every module gets a few attempts before the
// run gives up on it.
const SITE_MAX_PASSES = 12;
const MAX_MODULE_ATTEMPTS = 3;

function siteHome(listPage) {
  try {
    const origin = new URL(listPage.url()).origin;
    return origin.includes("salescoach") ? `${origin}/home/for-you` : SITE_HOME;
  } catch {
    return SITE_HOME;
  }
}

// The site's own top tabs — For You, Explore, whatever else this account is
// shown. They are read off the nav rather than hardcoded, so a renamed or moved
// tab still gets walked. `collectNodes` deliberately ignores nav links as page
// chrome, which is exactly why they have to be gathered separately here.
async function readNavLinks(targetPage) {
  return targetPage.evaluate(() => {
    const tidy = (value = "") => String(value).replace(/\s+/g, " ").trim();
    const found = new Map();
    const scopes = document.querySelectorAll('nav, [role="navigation"], header, [role="banner"]');
    for (const scope of scopes) {
      for (const anchor of scope.querySelectorAll("a[href]")) {
        if (!anchor.href.startsWith(location.origin)) continue;
        const url = anchor.href.split("#")[0];
        if (!/\/home\//.test(url)) continue;
        const title = tidy(anchor.innerText) || tidy(anchor.getAttribute("aria-label")) || url;
        if (!found.has(url)) found.set(url, title);
      }
    }
    return [...found].map(([url, title]) => ({ url, title }));
  }).catch(() => []);
}

export async function readNavHubs(targetPage) {
  const links = await readNavLinks(targetPage);
  return links.filter((link) => !SITE_HUB_SKIP.test(link.title) && !SITE_HUB_SKIP.test(link.url));
}

// XP is the number the account is judged on, so a run reports what it moved.
// It is read off whatever the page shows rather than from a known element:
// nothing in the player exposes it, and the wording differs by locale.
const XP_PATTERNS = [
  /\b(?:xp|points?|נקודות)\s*[:\-]?\s*([\d][\d.,]*)/i,
  /([\d][\d.,]*)\s*(?:xp|points|נקודות)\b/i
];

async function readXpFrom(targetPage) {
  const text = clean(await targetPage.locator("body").innerText().catch(() => ""));
  for (const pattern of XP_PATTERNS) {
    const found = text.match(pattern);
    if (!found) continue;
    const value = Number(found[1].replace(/[.,]/g, ""));
    if (Number.isFinite(value)) return value;
  }
  return null;
}

// The home page usually carries the total; the profile page is the fallback for
// a layout that only shows it there.
async function readXp(listPage, profileUrl) {
  const here = await readXpFrom(listPage);
  if (here !== null) return here;
  if (!profileUrl) return null;

  const back = listPage.url();
  try {
    await openListing(listPage, profileUrl);
    const value = await readXpFrom(listPage);
    await openListing(listPage, back).catch(() => {});
    return value;
  } catch {
    return null;
  }
}

async function collectHubs(listPage) {
  const home = siteHome(listPage);
  await openListing(listPage, home);

  const links = await readNavLinks(listPage);
  // For You is always walked, whether or not the nav names it.
  const hubs = new Map([[home, { url: home, title: "For You" }]]);
  for (const link of links) {
    if (SITE_HUB_SKIP.test(link.title) || SITE_HUB_SKIP.test(link.url)) continue;
    if (!hubs.has(link.url)) hubs.set(link.url, link);
  }
  const profile = links.find((link) => /profile|נקודות|my learning/i.test(`${link.title} ${link.url}`));
  return { hubs: [...hubs.values()], profileUrl: profile?.url || null };
}

// One hub page: everything listed on it is a root to walk into, and anything
// that is already a module is run right there.
async function walkHub(listPage, hub, state) {
  log(`Hub "${hub.title}": opening ${hub.url}`);
  try {
    await openListing(listPage, hub.url);
  } catch (error) {
    log(`Could not open "${hub.title}": ${error instanceof Error ? error.message : String(error)}`);
    return;
  }
  session().page = listPage;

  const nodes = await waitForChapterItems(listPage, 20000);
  const containers = nodes.filter((node) => node.kind === "container");
  const modules = nodes.filter((node) => node.kind === "module");
  log(`Hub "${hub.title}": ${containers.length} section(s) and ${modules.length} module(s) listed.`);
  if (!nodes.length) return;

  state.chapters.set(hub.url, {
    title: hub.title,
    url: hub.url,
    depth: -1,
    progress: null,
    modules: modules.length,
    subSections: containers.length
  });

  // A module linked straight from a hub belongs to no section; it is still work.
  for (const module of modules) {
    if (limitReached(state)) return;
    if (state.processedModules.has(module.id)) continue;
    if (module.locked) {
      state.deferred.set(module.id, { ...module, chapter: hub.title });
      continue;
    }
    if (state.skipCompleted && module.completed) {
      state.processedModules.add(module.id);
      state.skipped++;
      continue;
    }
    state.processedModules.add(module.id);
    state.pending++;
    await processModule({ ...module, chapter: hub.title }, state, {
      label: `[${state.modulesProcessed + 1}] `,
      listPage
    });
    if (!listPage.isClosed()) {
      await listPage.bringToFront().catch(() => {});
      session().page = listPage;
    }
  }

  for (const container of containers) {
    if (limitReached(state)) return;
    if (state.visitedContainers.has(container.id)) continue;
    if (container.locked) {
      state.deferred.set(container.id, { ...container, chapter: hub.title });
      log(`Locked for now: "${container.title}".`);
      continue;
    }
    if (state.skipCompleted && container.completed) {
      state.visitedContainers.add(container.id);
      log(`Already completed: "${container.title}".`);
      continue;
    }
    await walkContainer(listPage, container, state, 1);
    // walkContainer leaves the tab deep inside; the next root is opened by URL,
    // but the hub has to be re-read to find it after a sibling moved the page.
    await openListing(listPage, hub.url).catch(() => {});
  }
}

// The whole site in one click: every tab, every program, every section under
// them, running each module the same way a chapter run does. A quiz whose
// answers are known is answered and submitted; one that is not is answered
// blind when blind mode is on, and either way its grade is reported.
export async function processSite({ skipCompleted = true, limit = 0, onProgress = null, mode = "run", submitUnverified = false, blind = false, targetXp = 0 } = {}) {
  const listPage = await connectedPage();
  resetLogs();
  const state = createRunState({ onProgress, skipCompleted, limit, mode, submitUnverified, blind });

  log("Whole-site run: walking every tab this account can reach, not just the Academy.");
  if (blind && mode !== "capture") {
    log("Blind mode: a quiz with no stored answers is still answered and submitted, and its grade is reported back as an answer key.");
  }
  if (mode === "capture") log("Capture mode: quizzes are read, never answered or submitted.");
  if (limit > 0) log(`Stopping after ${limit} module(s).`);

  const { hubs, profileUrl } = await collectHubs(listPage);
  log(`Found ${hubs.length} tab(s) to walk: ${hubs.map((hub) => hub.title).join(", ")}.`);

  const xpBefore = await readXp(listPage, profileUrl);
  if (xpBefore === null) {
    log("No XP total is shown on this account's pages; the run will report progress by module instead.");
  } else {
    log(`XP before this run: ${xpBefore.toLocaleString()}${targetXp ? ` (target ${targetXp.toLocaleString()})` : ""}.`);
  }
  let xpAfter = xpBefore;

  for (let pass = 1; pass <= SITE_MAX_PASSES; pass++) {
    const processedBefore = state.modulesProcessed;
    const learnedBefore = state.answersLearned;
    state.visitedContainers = new Set();
    state.deferred = new Map();
    state.blocked = 0;

    // A quiz that did not pass, and a module that broke, are walked again: by
    // now the run has confirmed answers it did not have the first time.
    const retrying = [...state.retryable.keys()].filter((id) =>
      (state.attempts.get(id) || 0) < MAX_MODULE_ATTEMPTS);
    if (pass > 1) {
      for (const id of retrying) state.processedModules.delete(id);
      log(`Pass ${pass}: re-walking the site for anything that unlocked` +
        (retrying.length ? `, and retrying ${retrying.length} item(s) that did not pass.` : "."));
    }
    state.retryable = new Map();

    for (const hub of hubs) {
      if (limitReached(state)) break;
      await walkHub(listPage, hub, state);
    }

    const gained = state.modulesProcessed - processedBefore;
    const settled = state.answersLearned - learnedBefore;
    const stillShut = state.deferred.size + state.blocked;
    const toRetry = [...state.retryable.keys()].filter((id) =>
      (state.attempts.get(id) || 0) < MAX_MODULE_ATTEMPTS).length;

    xpAfter = await readXp(listPage, profileUrl);
    if (xpAfter !== null) {
      const moved = xpBefore === null ? null : xpAfter - xpBefore;
      log(`XP after pass ${pass}: ${xpAfter.toLocaleString()}${moved === null ? "" : ` (${moved >= 0 ? "+" : ""}${moved.toLocaleString()})`}.`);
    }

    if (limitReached(state)) {
      log(`Stopping: the ${limit}-module limit for this run was reached.`);
      break;
    }
    if (targetXp > 0 && xpAfter !== null && xpAfter >= targetXp) {
      log(`Target of ${targetXp.toLocaleString()} XP reached; stopping.`);
      break;
    }
    if (!stillShut && !toRetry) {
      log("Nothing is locked and nothing is left to retry; the walk is complete.");
      break;
    }
    // Another pass is only worth making if this one moved something: it opened
    // a lock, or it settled answers that a failed quiz can now be retried with.
    if (!gained && !settled) {
      log(`${stillShut} locked and ${toRetry} unpassed item(s) remain, and this pass moved nothing; stopping.`);
      break;
    }
    if (pass === SITE_MAX_PASSES) log("Reached the maximum number of passes.");
  }

  await openListing(listPage, siteHome(listPage)).catch(() => {});
  session().page = listPage;
  if (xpAfter === null) xpAfter = await readXp(listPage, profileUrl);

  const quizzes = state.results.filter((item) => item.type === "quiz");
  const passed = quizzes.filter((item) => item.passed === true).length;
  const failedQuizzes = quizzes.filter((item) => item.passed === false).length;
  log(`Site run finished: ${state.examsSubmitted} quiz(zes) submitted (${passed} passed, ${failedQuizzes} did not), ${state.resourcesRead} resource(s) read, ${state.failed} failure(s).`);
  const solved = state.learned.reduce((total, entry) =>
    total + entry.questions.filter((question) => question.confirmedAnswers).length, 0);
  const asked = state.learned.reduce((total, entry) => total + entry.questions.length, 0);
  if (asked) log(`Answer key learned this run: ${solved} of ${asked} question(s) confirmed across ${state.learned.length} quiz(zes).`);

  if (xpBefore !== null || xpAfter !== null) {
    const moved = xpBefore !== null && xpAfter !== null ? xpAfter - xpBefore : null;
    log(`XP: ${xpBefore === null ? "?" : xpBefore.toLocaleString()} \u2192 ${xpAfter === null ? "?" : xpAfter.toLocaleString()}` +
      (moved === null ? "" : ` (${moved >= 0 ? "+" : ""}${moved.toLocaleString()})`) +
      (targetXp > 0 && xpAfter !== null ? `, ${Math.max(0, targetXp - xpAfter).toLocaleString()} short of the ${targetXp.toLocaleString()} target` : ""));
  }

  const stillLocked = [...state.deferred.values()].map((node) => node.title);
  if (stillLocked.length) log(`Still locked: ${stillLocked.join(", ")}.`);

  return snapshotOf(state, {
    total: state.processedModules.size,
    processed: state.modulesProcessed,
    chapters: [...state.chapters.values()],
    hubs: hubs.map((hub) => hub.title),
    xp: { before: xpBefore, after: xpAfter, target: targetXp || null },
    stillLocked: state.blocked,
    stillIncomplete: stillLocked
  });
}

// Kept so the existing /api/for-you/run endpoint keeps working; the For You tab
// is only ever the way in to the Academy.
export async function processForYou(options = {}) {
  return processAcademy(options);
}

// A structural dump of whatever the connected tab is showing. When the walk
// misses a row, this is what says why: it reports every same-origin link the
// page offers, how the collector classified it, and what evidence it used.
export async function inspectPage() {
  const targetPage = await connectedPage();
  await openAllAccordions(targetPage).catch(() => {});
  await targetPage.waitForTimeout(500);

  const nodes = await collectNodes(targetPage);
  const links = [];
  for (const frame of targetPage.frames()) {
    const frameLinks = await frame.evaluate(() => {
      const tidy = (value = "") => String(value).replace(/\s+/g, " ").trim();
      return Array.from(document.querySelectorAll("a[href]"))
        .filter((anchor) => anchor.href.startsWith(location.origin))
        .slice(0, 300)
        .map((anchor) => {
          const card = anchor.closest(".entity, [role='listitem'], li, [class*='card' i]") || anchor.parentElement || anchor;
          return {
            url: anchor.href.split("#")[0],
            text: tidy(anchor.innerText).slice(0, 120),
            aria: tidy(anchor.getAttribute("aria-label")).slice(0, 160),
            cardClass: tidy(card.className).slice(0, 200),
            cardText: tidy(card.innerText).slice(0, 200)
          };
        });
    }).catch(() => []);
    links.push(...frameLinks);
  }

  // Rows that are not links at all: React cards whose click handler sits on a
  // div. If the Academy ever renders its chapters this way, they show up here
  // and nowhere else.
  const clickableRows = await targetPage.evaluate(() => {
    const tidy = (value = "") => String(value).replace(/\s+/g, " ").trim();
    return Array.from(document.querySelectorAll('[role="button"], [onclick], [tabindex="0"]'))
      .filter((element) => !element.closest("a[href]") && element.tagName !== "BUTTON")
      .slice(0, 100)
      .map((element) => ({
        tag: element.tagName.toLowerCase(),
        className: tidy(element.className).slice(0, 200),
        text: tidy(element.innerText).slice(0, 160)
      }))
      .filter((row) => row.text);
  }).catch(() => []);

  return {
    url: targetPage.url(),
    title: await targetPage.title().catch(() => ""),
    progress: await readChapterProgress(targetPage),
    player: await moduleAssessmentState(targetPage),
    lockedRowsWithoutLinks: await countLockedRows(targetPage),
    counts: {
      modules: nodes.filter((node) => node.kind === "module").length,
      containers: nodes.filter((node) => node.kind === "container").length,
      locked: nodes.filter((node) => node.locked).length,
      completed: nodes.filter((node) => node.completed).length
    },
    nodes,
    clickableRows,
    links
  };
}

// The flat list of controls a capture returns says what the quiz asks but not
// how the questions are grouped, which is the part exams.js needs. SEED wraps
// each question in `.question` and gives every option of one question the same
// input `name`, so both are recoverable.
function captureQuestionsScript() {
  return () => {
    const tidy = (value = "") => String(value).replace(/\s+/g, " ").trim();
    const HEADING = ".questionText, .question_text, .question-title, .question_title, legend, h1, h2, h3, h4";

    const labelFor = (input) => {
      const labels = input.labels ? Array.from(input.labels) : [];
      if (labels.length) return tidy(labels.map((label) => label.innerText).join(" "));
      const owner = input.closest("label");
      if (owner) return tidy(owner.innerText);
      return tidy(input.getAttribute("aria-label") || "");
    };

    return Array.from(document.querySelectorAll(".question")).map((question, index) => {
      const inputs = Array.from(question.querySelectorAll('input[type="radio"], input[type="checkbox"]'));
      const selects = Array.from(question.querySelectorAll("select"));
      const heading = question.querySelector(HEADING);
      // The heading element is not always present; fall back to the question's
      // own text with the option labels stripped back out of it.
      let text = tidy(heading?.innerText || "");
      if (!text) {
        const optionText = new Set(inputs.map(labelFor));
        text = tidy(question.innerText.split("\n").filter((line) => !optionText.has(tidy(line))).join(" "));
      }

      const checkboxes = inputs.filter((input) => input.type === "checkbox");
      const type = selects.length ? "selects" : (checkboxes.length ? "multiple" : "single");
      // "Select two." tells the runner how many boxes a multiple expects.
      const expected = tidy(question.innerText).match(/select\s+(two|three|four|\d+)|יש לבחור\s+(\d+)/i);
      const words = { two: 2, three: 3, four: 4 };

      return {
        number: index + 1,
        text: text.slice(0, 400),
        type,
        questionId: tidy(inputs[0]?.getAttribute("name") || ""),
        expectedAnswers: expected
          ? (Number(expected[2]) || words[String(expected[1]).toLowerCase()] || Number(expected[1]) || null)
          : (type === "single" ? 1 : null),
        options: inputs.map((input) => ({
          label: labelFor(input),
          value: input.getAttribute("value") || "",
          checked: input.checked
        })),
        selects: selects.map((select) => Array.from(select.options).map((option) => tidy(option.textContent)).filter(Boolean))
      };
    }).filter((question) => question.options.length || question.selects.length);
  };
}

// Whether the package ships its own answer key to the browser. If it does, every
// exam can be added to exams.js without anyone having to sit the quiz first, so
// it is worth asking before falling back to sitting them.
function captureAnswerKeyScript() {
  return () => {
    if (typeof SeedInterface === "undefined" || !SeedInterface.QSP) {
      return { available: false, reason: "The SEED player is not on this frame." };
    }

    const safe = (value) => {
      try {
        const copy = JSON.parse(JSON.stringify(value));
        const text = JSON.stringify(copy);
        return text.length > 2000 ? `${text.slice(0, 2000)}…` : copy;
      } catch {
        return String(value).slice(0, 200);
      }
    };

    // Any key that could plausibly hold a correct response.
    const KEYISH = /^(correct|correctAnswer|correctAnswers|correctResponse|correctResponses|answerKey|answers?|isCorrect|solution|key|score|weight|points)$/i;
    const hits = [];
    const shape = {};
    const seen = new Set();

    const walk = (node, path, depth, into) => {
      if (!node || typeof node !== "object" || depth > 6 || hits.length > 300) return;
      if (seen.has(node)) return;
      seen.add(node);

      for (const key of Object.keys(node)) {
        let value;
        try {
          value = node[key];
        } catch {
          continue;
        }
        if (typeof value === "function") continue;
        const here = `${path}.${key}`;
        if (into && depth < 3) {
          into[key] = Array.isArray(value)
            ? `array(${value.length})`
            : (value && typeof value === "object" ? {} : typeof value);
        }
        if (KEYISH.test(key)) hits.push({ path: here, value: safe(value) });
        walk(value, here, depth + 1, into && depth < 3 && value && typeof value === "object" && !Array.isArray(value) ? into[key] : null);
      }
    };

    walk(SeedInterface.QSP, "QSP", 0, shape);

    const assessments = [];
    try {
      for (const element of document.querySelectorAll("[assessmentId]")) {
        const id = element.getAttribute("assessmentId");
        const assessment = SeedInterface.QSP.getAssessmentWithID?.(id);
        if (assessment) assessments.push({ id, keys: Object.keys(assessment).slice(0, 60) });
      }
    } catch {}

    return {
      available: true,
      completionScore: Number.isFinite(SeedInterface.QSP.completionScore) ? SeedInterface.QSP.completionScore : null,
      assessments,
      // Anything named like a correct answer, so a real key is obvious if present.
      candidates: hits.slice(0, 120),
      shape
    };
  };
}

// Turns a capture into text that can be pasted into exams.js, so adding an exam
// is filling in answers rather than retyping every question.
function examsJsDraft(title, questions) {
  const id = clean(title).toLowerCase()
    .replace(/\s*\|.*$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "new-exam";

  const lines = questions.map((question) => {
    // Matching is on a distinctive fragment, not the whole question: the site
    // rewraps and re-punctuates its own text between renders.
    const match = clean(question.text).slice(0, 60).replace(/"/g, "'");
    if (question.type === "selects") {
      return `      { type: "selects", match: "${match}", answers: [${question.selects.map(() => '""').join(", ")}] },`;
    }
    if (question.type === "multiple") {
      const blanks = Array.from({ length: question.expectedAnswers || 2 }, () => '""').join(", ");
      return `      { type: "multiple", match: "${match}", answers: [${blanks}] },`;
    }
    return `      { type: "single", match: "${match}", answer: "" },`;
  });

  const options = questions.map((question) =>
    `  // ${question.number}. ${clean(question.text).slice(0, 90)}\n` +
    (question.options.length
      ? question.options.map((option) => `  //      - ${option.label}`).join("\n")
      : question.selects.map((select, index) => `  //      select ${index + 1}: ${select.join(" | ")}`).join("\n"))
  ).join("\n");

  return `  // Options to choose from:\n${options}\n  "${id}": {\n    name: "${clean(title).replace(/\s*\|.*$/, "").replace(/"/g, "'")}",\n    questions: [\n${lines.join("\n")}\n    ]\n  },`;
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

  // The grouped view of the same quiz, plus whatever the player will say about
  // its own answers.
  let questions = [];
  let answerKey = null;
  for (const frame of targetPage.frames()) {
    if (!questions.length) {
      questions = await frame.evaluate(captureQuestionsScript()).catch(() => []);
    }
    if (!answerKey?.available) {
      const probe = await frame.evaluate(captureAnswerKeyScript()).catch(() => null);
      if (probe?.available) answerKey = probe;
      else if (!answerKey) answerKey = probe;
    }
  }

  const result = {
    title: clean(await targetPage.title().catch(() => "Untitled exam")),
    url: targetPage.url(),
    capturedAt: new Date().toISOString(),
    questions,
    answerKey,
    // A skeleton in the shape exams.js expects. The answers are left empty on
    // purpose: nothing here knows them yet, and a guessed key is worse than a
    // missing one because a wrong submission still costs an attempt.
    examsJsDraft: examsJsDraft(clean(await targetPage.title().catch(() => "")), questions),
    frames: capturedFrames
  };
  const hasExamControls = capturedFrames.some((frame) => frame.controls?.length > 0);
  if (!hasExamControls) {
    throw new Error("Could not capture an exam. Open the exam questions in the connected tab first.");
  }
  log(`Captured ${questions.length} question(s).`);
  if (answerKey?.candidates?.length) {
    log(`The player exposes ${answerKey.candidates.length} answer-shaped field(s); check answerKey.candidates in the JSON.`);
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

    let input = label.locator('input[type="checkbox"], input[type="radio"]').first();
    if (!(await input.count().catch(() => 0))) {
      const forId = await label.getAttribute("for").catch(() => null);
      input = forId ? block.locator(`input[id="${forId}"]`).first() : null;
      if (input && !(await input.count().catch(() => 0))) input = null;
    }
    // Some questions answer with pictures: the label carries an image and no
    // text at all, and the only thing that tells the options apart is the
    // input's value. Such a row is kept so an answer can name that value.
    const value = input ? clean(await input.getAttribute("value").catch(() => "") || "") : "";
    if (!text && !value) continue;
    rows.push({ label, text, value, input });
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
  const exact = (row, answer) => row.text === answer || (row.value && row.value === answer);
  const plan = rows.map((row) => {
    const hit = wanted.find((answer) => exact(row, answer)) ||
      wanted.find((answer) => !rows.some((candidate) => exact(candidate, answer)) &&
        row.text && row.text.includes(answer));
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
      const name = entry.row.text || entry.row.value;
      throw new Error(`Could not ${entry.shouldSelect ? "select" : "clear"} option: ${name.slice(0, 70)}`);
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

  if (!preserveLogs) resetLogs();
  log(`Starting "${exam.name}"${dryRun ? " (dry run)" : ""}`);
  log(`Using connected tab: ${await targetPage.title().catch(() => targetPage.url())}`);
  log("Matching questions by their text; rendered question order is ignored.");

  let success = 0;
  let failed = 0;
  // An answer nobody has confirmed against the real quiz. These are filled like
  // any other, but the caller decides whether an attempt is worth spending on
  // them: on a two-question quiz at an 80 percent threshold, one wrong answer
  // fails the whole attempt.
  const unverified = [];

  for (const q of exam.questions) {
    try {
      if (!immediate && success + failed > 0) await targetPage.waitForTimeout(randomDelay(2, 5));
      await fillQuestion(q, dryRun, { immediate });
      if (q.unverified) {
        unverified.push(q.match);
        log(`! ${q.match}: this answer is a best guess and has never been confirmed.`);
      }
      success++;
    } catch (error) {
      failed++;
      log(`✗ ${q.match}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  log(`Done. ${success} succeeded, ${failed} failed${unverified.length ? `, ${unverified.length} unverified` : ""}.`);
  log("Final submission was NOT clicked. Review the exam in the browser.");

  return { success, failed, total: exam.questions.length, unverified };
}
