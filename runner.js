import { chromium } from "playwright";
import { AsyncLocalStorage } from "node:async_hooks";
import fs from "node:fs";
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

// `backTo` only controls the breadcrumb destination. The same collection is
// linked with a different value from each parent, so query-sensitive identity
// creates cycles (Education -> Learning -> Education) and walks completed trees
// repeatedly. A Sales Coach content container's pathname is its stable ID.
function containerId(rawUrl) {
  try {
    return `container:${new URL(rawUrl).pathname}`;
  } catch {
    return `container:${String(rawUrl).split(/[?#]/)[0]}`;
  }
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

// A run is worthless once the account is signed out: every module load lands on
// the sign-in page, so the walk churns through the whole site failing. Detect it
// once and stop with an answer the user can act on.
export function looksSignedOut(url = "") {
  return /salescoach\.apple\.com\/(signin|login|registration)\b/i.test(String(url));
}

// Thrown rather than reported per module: once the account is signed out every
// remaining module would fail the same way, so this unwinds the whole walk.
export class SignedOutError extends Error {
  constructor() {
    super("Signed out of Sales Coach: the page redirected to the sign-in screen. Log in again in this session's window, then start the run.");
    this.name = "SignedOutError";
    this.signedOut = true;
  }
}

export async function assertSignedIn(targetPage) {
  if (!looksSignedOut(targetPage.url())) return true;
  throw new SignedOutError();
}

// A picture of whatever the connected tab is showing. The structural inspector
// says what the page offers; this says what it looks like, which is the only way
// to tell a stalled load apart from a page that rendered something unexpected.
export async function screenshotPage({ fullPage = false } = {}) {
  const targetPage = await connectedPage();
  return targetPage.screenshot({ fullPage: Boolean(fullPage), timeout: 20000 });
}

// Debugging a missing answer should not require another whole-site walk just
// to return to the module. Keep this deliberately limited to Sales Coach so a
// caller cannot turn the local runner into a general-purpose URL opener.
export async function openSalesCoachUrl(rawUrl) {
  const targetPage = await connectedPage();
  const url = new URL(String(rawUrl || ""));
  if (url.protocol !== "https:" || !/(^|\.)salescoach\.apple\.com$/i.test(url.hostname)) {
    throw new Error("Only https://salescoach.apple.com URLs can be opened.");
  }
  await targetPage.goto(url.href, { waitUntil: "domcontentloaded", timeout: EXAM_LOAD_TIMEOUT_MS });
  await targetPage.bringToFront();
  session().page = targetPage;
  log(`Opened Sales Coach URL for debugging: ${url.href}`);
  return { connected: true, session: session().id, url: targetPage.url(), title: await targetPage.title() };
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
      // A card carrying one of these is a learning item in its own right, and is
      // walked into without needing siblings of the same shape to vouch for it.
      // "container-url" belongs here: /home/collection/<id> and its siblings are
      // id-bearing listing URLs that nothing but a listing card carries, and the
      // breadcrumb and tab-bar copies of them are already dropped by isChrome().
      // Without it, a lone COLLECTION card — the "מהלך מכירות" and Specialist
      // rows on the Academy page — was collected only when another card happened
      // to share its URL shape, and silently dropped when none did.
      const STATE_SIGNALS = ["progress-bar", "completion-badge", "lock", "aria-completed", "kind-label", "container-url"];

      const containerEvidence = (anchor, card) => {
        const reasons = [];
        const text = tidy(card.innerText);
        if (card.querySelector('[role="progressbar"], progress, [class*="progress" i]')) reasons.push("progress-bar");
        if (card.querySelector(".completed-task, [class*='completed' i]")) reasons.push("completion-badge");
        if (card.querySelector("[class*='lock' i], [aria-label*='lock' i]")) reasons.push("lock");
        if (/,\s*completed\b/i.test(tidy(anchor.getAttribute("aria-label")))) reasons.push("aria-completed");
        // The label sits above the title in the card, but innerText order is not
        // guaranteed to put it first in an RTL layout, so it is looked for
        // anywhere in the opening of the card rather than only at the start.
        if (/(^|\s)(collection|course|chapter|program|series|path|module)\b/i.test(text.slice(0, 60))) reasons.push("kind-label");
        if (/\d+\s*(?:\/\s*\d+)?\s*(?:completed|required)/i.test(text)) reasons.push("counter");
        // A listing URL is a "<kind>/<id>" pair anywhere in the path, not only
        // directly under /home/. The Explore tab files its curricula under
        // /home/explore/curriculum/<id>, and anchoring this to /home/ meant the
        // nine curricula that hold most of the site's content were not
        // recognised as sections at all — a whole-site run would walk the
        // Academy, find everything in it finished, and stop with the catalogue
        // untouched.
        if (/\/(collection|course|chapter|program|curriculum|journey|learningplan|learning-plan|path|plan|series|topic)\/\d+/i.test(anchor.href)) {
          reasons.push("container-url");
        }
        // The "See All" pages carry no id: /home/explore/collections is a
        // listing in its own right and the only way into everything the rails
        // on the tab do not show.
        if (/\/home\/[a-z-]+\/(collections|curriculums|curricula|courses|programs)\/?$/i.test(anchor.href)) {
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
          id: `container:${new URL(url).pathname}`,
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

// Not every module is a SEED package. A good many are a plain video the site
// plays itself, in the main frame, with no SeedInterface anywhere on the page.
// Waiting for a player that is never coming is what reported those as "the SEED
// content player never loaded" and failed them again on every pass.
async function readNativeVideoState(targetPage) {
  return targetPage.mainFrame().evaluate(() => {
    const videos = Array.from(document.querySelectorAll("video"));
    // Metadata is what says the video is really there rather than an empty
    // element the page put in ahead of its source.
    if (!videos.some((video) => video.readyState > 0 || Number.isFinite(video.duration))) return null;
    return { videos: videos.length, textLength: (document.body?.innerText || "").length };
  }).catch(() => null);
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

    // No SEED package has turned up. A video the site plays itself is ready as
    // soon as its own element has metadata, and it is finished the same way any
    // other resource is: play it through.
    if (!last) {
      const native = await readNativeVideoState(targetPage);
      if (native) {
        log("This module is a video page rather than a SEED package; playing it in the page itself.");
        return {
          frame: targetPage.mainFrame(),
          hasAssessments: false,
          questions: 0,
          submitButtons: 0,
          native: true,
          ...native
        };
      }
    }

    await targetPage.waitForTimeout(500);
  }

  return last;
}

// The site regularly serves a module whose player frame died on load: the
// iframe lands on chrome-error and nothing ever appears inside it. Reloading
// clears it, so a module gets a few goes at loading before the run gives up.
const MODULE_LOAD_ATTEMPTS = 3;
const MODULE_ATTEMPT_TIMEOUT_MS = 45000;

async function loadModulePlayer(itemPage) {
  for (let attempt = 1; attempt <= MODULE_LOAD_ATTEMPTS; attempt++) {
    const ready = await waitForModuleReady(itemPage, MODULE_ATTEMPT_TIMEOUT_MS);
    if (ready) return ready;
    if (attempt === MODULE_LOAD_ATTEMPTS) break;
    log(`Nothing has loaded in ${Math.round(MODULE_ATTEMPT_TIMEOUT_MS / 1000)}s; reloading this module (attempt ${attempt + 1} of ${MODULE_LOAD_ATTEMPTS}).`);
    await itemPage.reload({ waitUntil: "domcontentloaded", timeout: EXAM_LOAD_TIMEOUT_MS }).catch(() => {});
    await itemPage.waitForTimeout(2500 * attempt);
  }
  return null;
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
        const tidy = (value = "") => String(value).replace(/\s+/g, " ").trim();
        // "1 unanswered" on its own says nothing about what the question is,
        // and a blind fill only knows radios, checkboxes and dropdowns. What
        // the player refused to accept is described here so an unhandled
        // control type shows up in the log rather than as a silent failure.
        const unansweredDetail = Array.from(result.$unansweredQuestions).slice(0, 5).map((element) => {
          const node = element.closest?.(".question") || element;
          const heading = node.querySelector?.(
            ".questionText, .question_text, .question-title, .question_title, legend, h1, h2, h3, h4"
          );
          const controls = {};
          for (const input of node.querySelectorAll?.("input, select, textarea, [contenteditable='true']") || []) {
            const kind = input.tagName === "INPUT" ? `input[${input.type || "text"}]` : input.tagName.toLowerCase();
            controls[kind] = (controls[kind] || 0) + 1;
          }
          return {
            text: tidy(heading?.innerText || node.innerText).slice(0, 200),
            classes: tidy(node.className).slice(0, 160),
            controls,
            // A drag-and-drop or hotspot question carries neither an input nor a
            // select, so the tag names inside it are the only clue to what it is.
            tags: [...new Set(Array.from(node.querySelectorAll?.("*") || [])
              .map((child) => child.tagName.toLowerCase()))].slice(0, 20).join(",")
          };
        });
        built = {
          unanswered: result.$unansweredQuestions.length,
          answers: result.postObj.answers.length,
          unansweredDetail
        };
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
    for (const detail of before.built.unansweredDetail || []) {
      log(`Unanswered question: "${detail.text}" — controls ${JSON.stringify(detail.controls)}, classes "${detail.classes}", tags ${detail.tags}.`);
    }
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

// A failed quiz is offered again, and taking that offer in the same tab is the
// difference between one guess per whole-site pass and a question that is
// worked out on the spot. Most SEED packages reset themselves to an answerable
// state as soon as the grade is shown — the failed attempt's wrong answers are
// cleared and the Submit button comes back — so the reset is waited for first
// and a "try again" control is only looked for when it does not arrive.
const QUIZ_RETRY_READY_MS = 20000;

// What the player says about how many goes this quiz still has. The SEED
// assessment object carries the real numbers, and reading them is the
// difference between a retry loop that stops when the site says stop and one
// that keeps clicking at a quiz that is already locked out.
async function readAttemptState(frame) {
  return frame.evaluate(() => {
    if (typeof SeedInterface === "undefined" || !SeedInterface.QSP) return null;
    const found = [];
    try {
      for (const element of document.querySelectorAll("[assessmentId]")) {
        const id = element.getAttribute("assessmentId");
        const assessment = SeedInterface.QSP.getAssessmentWithID?.(id);
        if (!assessment) continue;
        found.push({
          id,
          remainingAttempts: Number.isFinite(assessment.remainingAttempts) ? assessment.remainingAttempts : null,
          numberOfAttempts: Number.isFinite(assessment.numberOfAttempts) ? assessment.numberOfAttempts : null,
          limitedAttempts: Boolean(assessment.limitedAttempts),
          multipleAttemptsAllowed: Boolean(assessment.multipleAttemptsAllowed),
          tryAgainEnabled: Boolean(assessment.tryAgainEnabled),
          lockedOut: Boolean(assessment.lockedOut)
        });
      }
    } catch {
      return null;
    }
    if (!found.length) return null;
    // A module can hold more than one assessment; the run is bounded by the
    // tightest of them.
    return found.reduce((tightest, entry) => {
      if (!tightest) return entry;
      const a = entry.remainingAttempts ?? Infinity;
      const b = tightest.remainingAttempts ?? Infinity;
      return a < b ? entry : tightest;
    }, null);
  }).catch(() => null);
}

// What the player itself counts as still unanswered. This is the only
// authority: a question can look filled in the DOM and still be missing from
// the payload the player would post.
async function unansweredCount(frame) {
  return frame.evaluate(() => {
    const jq = window.jQuery || window.$;
    if (!jq || typeof SeedInterface === "undefined" || !SeedInterface.QSP?.buildReturnJSON) return null;
    try {
      return SeedInterface.QSP.buildReturnJSON(jq("form[assessmentId]").first()).$unansweredQuestions.length;
    } catch {
      return null;
    }
  }).catch(() => null);
}

// A drag-and-drop question renders its accessible dropdowns after the rest of
// the quiz has painted, so a fill that ran once can miss a question whose
// controls did not exist yet — and one unfilled question makes the player
// refuse the whole submission, taking every other answer on the quiz with it.
// Fill again while the number the player is unhappy about is still falling.
async function fillUntilAnswered(targetPage, frame, { rounds = 3 } = {}) {
  let previous = await unansweredCount(frame);
  for (let round = 1; round <= rounds && previous > 0; round++) {
    log(`The player still counts ${previous} question(s) as unanswered; filling again (round ${round} of ${rounds}).`);
    await targetPage.waitForTimeout(2000);
    const filled = await fillBlindly(
      frame,
      Object.fromEntries(learnedAnswers),
      Object.fromEntries(rejectedAnswers)
    );
    reportUnmatchedLearned(filled);
    const now = await unansweredCount(frame);
    if (now === null || now >= previous) {
      previous = now;
      break;
    }
    previous = now;
  }
  return previous;
}

async function quizIsAnswerable(frame) {
  return frame.evaluate(() => {
    const button = document.querySelector(".submitAssessmentButton");
    if (!button || button.classList.contains("disabled")) return false;
    const inputs = Array.from(document.querySelectorAll('.question input[type="radio"], .question input[type="checkbox"]'));
    if (!inputs.length) return false;
    return inputs.some((input) => !input.disabled);
  }).catch(() => false);
}

async function startAnotherAttempt(targetPage, frame) {
  const deadline = Date.now() + QUIZ_RETRY_READY_MS;
  let clicked = null;

  while (Date.now() < deadline) {
    if (await quizIsAnswerable(frame)) return true;

    if (!clicked) {
      clicked = await frame.evaluate(() => {
        const RETRY = /try again|try it again|retake|start over|נסה שוב|נסו שוב/i;
        const MARKS = /tryagain|try-again|retry|retake|restart/i;
        const tidy = (value = "") => String(value).replace(/\s+/g, " ").trim();

        for (const element of document.querySelectorAll(
          "button, a, [role='button'], input[type='button'], input[type='submit'], [class*='try' i], [class*='retry' i], [class*='retake' i]"
        )) {
          const text = tidy(element.innerText || element.value || element.getAttribute("aria-label"));
          const marks = tidy(`${element.className || ""} ${element.id || ""}`);
          if (!RETRY.test(text) && !MARKS.test(marks)) continue;
          const rect = element.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) continue;
          element.click();
          return text || marks;
        }
        return null;
      }).catch(() => null);
      if (clicked) log(`Taking another attempt at this quiz: clicked "${clicked.slice(0, 60)}".`);
    }

    await targetPage.waitForTimeout(1000);
  }

  return quizIsAnswerable(frame);
}

// Whatever the last grade rejected is cleared before the next attempt is
// filled. A stored answer that the server has just called wrong would otherwise
// be put straight back, and the retry would send the same attempt again.
async function clearRejectedQuestions(frame, graded) {
  const keys = (graded.gradedQuestions || [])
    .filter((question) => question.state === "incorrect")
    .map((question) => answerKeyOf(question.question))
    .filter(Boolean);
  if (!keys.length) return 0;

  return frame.evaluate((wrongKeys) => {
    const tidy = (value = "") => String(value).replace(/\s+/g, " ").trim();
    const keyOf = (text) => tidy(String(text).normalize("NFKC"))
      .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, " ")
      .replace(/^\d+[\s.)]*/, "")
      .replace(/(?:יש לבחור|select)\s+(?:one|two|three|four|five|\d+).*$/i, "")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim().toLowerCase().slice(0, 64);
    let cleared = 0;

    for (const question of document.querySelectorAll(".question")) {
      const heading = question.querySelector(
        ".questionText, .question_text, .question-title, .question_title, legend, h1, h2, h3, h4"
      );
      const keys = [keyOf(heading?.innerText || ""), keyOf(question.innerText || "")];
      if (!keys.some((key) => key && wrongKeys.includes(key))) continue;
      for (const input of question.querySelectorAll('input[type="radio"], input[type="checkbox"]')) {
        if (!input.checked) continue;
        // A checkbox is cleared by clicking it, which is also what keeps the
        // player's own model in step. A radio is not: clicking the one that is
        // already on leaves it on, which left every wrong single-answer
        // question holding its rejected answer and made each retry a copy of
        // the attempt before it.
        if (input.type === "checkbox") {
          input.click();
        } else {
          input.checked = false;
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }
        cleared++;
      }
    }
    return cleared;
  }, keys).catch(() => 0);
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

// Everything a grade teaches has to outlive the process. The answer bank in
// exams.js is hand-maintained and always behind the site; what the server
// confirms during a run is the only key that grows on its own, and holding it
// in memory meant every restart threw it away and the next run guessed the same
// wrong options again. Persisted here, each run starts from every answer every
// earlier run settled, which is what lets a fresh account converge instead of
// re-rolling the same dice.
const ANSWER_MEMORY_PATH = new URL("./answer-memory.json", import.meta.url);
let answerMemoryDirty = false;
let answerMemoryTimer = null;

function loadAnswerMemory() {
  try {
    const saved = JSON.parse(fs.readFileSync(ANSWER_MEMORY_PATH, "utf8"));
    for (const [key, answers] of Object.entries(saved.learned || {})) {
      if (Array.isArray(answers) && answers.length) learnedAnswers.set(key, answers);
    }
    for (const [key, entry] of Object.entries(saved.rejected || {})) {
      rejectedAnswers.set(key, {
        options: Array.isArray(entry?.options) ? entry.options : [],
        sets: Array.isArray(entry?.sets) ? entry.sets : [],
        orders: Array.isArray(entry?.orders) ? entry.orders : []
      });
    }
    console.log(`Answer memory: ${learnedAnswers.size} confirmed answer(s) and ${rejectedAnswers.size} narrowed question(s) carried over from earlier runs.`);
  } catch {
    // No file yet, or an unreadable one. Either way this run starts empty and
    // writes a fresh file the first time a grade settles something.
  }
}

function saveAnswerMemory() {
  answerMemoryDirty = false;
  try {
    // Merge with whatever is on disk rather than overwriting it. Another run,
    // or the capture importer, may have added answers since this process read
    // the file, and a plain write would throw them away — the memory is only
    // worth keeping if it never goes backwards.
    const learned = { ...(readAnswerMemoryFile().learned || {}), ...Object.fromEntries(learnedAnswers) };
    const rejected = { ...(readAnswerMemoryFile().rejected || {}) };
    for (const [key, mine] of rejectedAnswers) {
      const theirs = rejected[key] || { options: [], sets: [], orders: [] };
      rejected[key] = {
        options: [...new Set([...(theirs.options || []), ...mine.options])],
        sets: dedupeLists([...(theirs.sets || []), ...mine.sets]),
        orders: dedupeLists([...(theirs.orders || []), ...(mine.orders || [])])
      };
    }
    fs.writeFileSync(ANSWER_MEMORY_PATH, `${JSON.stringify({
      savedAt: new Date().toISOString(),
      learned,
      rejected
    }, null, 2)}\n`);
  } catch (error) {
    console.log(`Could not save the answer memory: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function dedupeLists(lists) {
  const seen = new Set();
  const out = [];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    const signature = list.join("\u0000");
    if (seen.has(signature)) continue;
    seen.add(signature);
    out.push(list);
  }
  return out;
}

function readAnswerMemoryFile() {
  try {
    return JSON.parse(fs.readFileSync(ANSWER_MEMORY_PATH, "utf8"));
  } catch {
    return {};
  }
}

// A run submits a quiz every couple of minutes, so the write is coalesced
// rather than repeated per question; it is also flushed on exit so a run that
// is stopped mid-walk still keeps what it learned.
function queueAnswerMemorySave() {
  answerMemoryDirty = true;
  if (answerMemoryTimer) return;
  answerMemoryTimer = setTimeout(() => {
    answerMemoryTimer = null;
    if (answerMemoryDirty) saveAnswerMemory();
  }, 2000);
  answerMemoryTimer.unref?.();
}

for (const signal of ["exit", "SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (answerMemoryDirty) saveAnswerMemory();
    if (signal !== "exit") process.exit(0);
  });
}

export function answerKeyOf(questionText) {
  return clean(questionText).normalize("NFKC")
    .replace(/^\d+[\s.)]*/, "")
    .replace(/(?:יש לבחור|select)\s+(?:one|two|three|four|five|\d+).*$/i, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim().toLocaleLowerCase().slice(0, 64);
}

// The other half of what a grade says. A "select one" question the server
// marked wrong rules that option out for good, and a "select three" rules out
// that combination. Without this, every retry re-picked the same first option
// and a question with no stored answer could never be solved by trying again.
const rejectedAnswers = new Map();

function rejectionsFor(key) {
  if (!rejectedAnswers.has(key)) rejectedAnswers.set(key, { options: [], sets: [], orders: [] });
  const entry = rejectedAnswers.get(key);
  // Older memory files predate `orders`.
  if (!entry.orders) entry.orders = [];
  return entry;
}

function rememberLearned(learned) {
  let remembered = 0;
  for (const question of learned.questions || []) {
    const key = answerKeyOf(question.question);
    if (!key) continue;

    if (question.state === "incorrect" && question.chose?.length) {
      const rejected = rejectionsFor(key);
      // Kept as the set itself rather than a joined string: the player appends
      // its feedback to the label of a graded option, so the answers coming
      // back out of a grade have to be matched loosely against the plain
      // labels on the page.
      const combination = [...question.chose].sort();
      if (!rejected.sets.some((set) => set.join("\u0000") === combination.join("\u0000"))) {
        rejected.sets.push(combination);
      }
      // A matching question's answer is an assignment, not a set: "A to 1, B to
      // 2" and "A to 2, B to 1" are different attempts that sort to the same
      // thing. Sorted sets alone would rule out both after trying one, so the
      // order the dropdowns were left in is kept as well.
      if (question.type === "selects") {
        const order = [...question.chose];
        if (!rejected.orders.some((tried) => tried.join("\u0000") === order.join("\u0000"))) {
          rejected.orders.push(order);
        }
      }
      // Only a single-answer question convicts the option itself: one wrong
      // option in a three-answer set says nothing about the other two.
      if (question.type === "single") {
        for (const chosen of question.chose) {
          if (!rejected.options.includes(chosen)) rejected.options.push(chosen);
        }
      }
    }

    if (!question.confirmedAnswers?.length) continue;
    if (!learnedAnswers.has(key)) remembered++;
    learnedAnswers.set(key, question.confirmedAnswers);
  }
  queueAnswerMemorySave();
  return remembered;
}

export function clearLearnedAnswers() {
  learnedAnswers.clear();
  rejectedAnswers.clear();
  saveAnswerMemory();
}

// How much the run already knows before it starts, so the log says whether a
// pass is guessing from nothing or building on what earlier runs settled.
// Fold answers established outside a run — a capture file that carries the
// player's own graded responses — into the same memory a run builds. Each entry
// is { question, type, chose, correct }: what was asked, what was picked, and
// whether the server scored it.
export function rememberExternalAnswers(entries = []) {
  let confirmed = 0;
  let ruledOut = 0;
  for (const entry of entries) {
    const key = answerKeyOf(entry.question || "");
    if (!key || !entry.chose?.length) continue;
    if (entry.correct) {
      if (!learnedAnswers.has(key)) confirmed++;
      learnedAnswers.set(key, entry.chose);
      continue;
    }
    const rejected = rejectionsFor(key);
    const combination = [...entry.chose].sort();
    if (!rejected.sets.some((set) => set.join("\u0000") === combination.join("\u0000"))) {
      rejected.sets.push(combination);
      ruledOut++;
    }
    if (entry.type === "single") {
      for (const chosen of entry.chose) {
        if (!rejected.options.includes(chosen)) rejected.options.push(chosen);
      }
    }
    if (entry.type === "selects") {
      const order = [...entry.chose];
      if (!rejected.orders.some((tried) => tried.join("\u0000") === order.join("\u0000"))) {
        rejected.orders.push(order);
      }
    }
  }
  saveAnswerMemory();
  return { confirmed, ruledOut };
}

export function answerMemoryStats() {
  return { confirmed: learnedAnswers.size, narrowed: rejectedAnswers.size };
}

loadAnswerMemory();

async function fillBlindly(frame, known = {}, rejected = {}) {
  return frame.evaluate(([knownAnswers, rejectedAnswersByKey]) => {
    const tidy = (value = "") => String(value).replace(/\s+/g, " ").trim();
    const WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5 };
    const picked = [];
    // Questions whose confirmed answer could not be matched to anything the
    // page is offering. Reported so a key that silently stops applying shows up
    // instead of looking like a run that simply keeps guessing wrong.
    const unmatched = [];
    // Questions the memory has no answer for under the key this page produces.
    // When the run has just confirmed an answer for a question and still cannot
    // find it a moment later, the key is what has gone wrong, and the key is
    // what this reports.
    const unresolved = [];

    const labelOf = (input, question) => {
      const label = input.labels?.[0] ||
        question.querySelector(`label[for="${CSS.escape(input.id || "unmatched")}"]`) ||
        input.closest("label");
      return tidy(label?.innerText || input.value);
    };

    const keyOf = (text) => tidy(String(text).normalize("NFKC"))
      .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, " ")
      .replace(/^\d+[\s.)]*/, "")
      .replace(/(?:יש לבחור|select)\s+(?:one|two|three|four|five|\d+).*$/i, "")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim().toLowerCase().slice(0, 64);
    // A confirmed answer captured after a submit carries the site's feedback
    // appended to the option it revealed ("Mac נכון. ..."), so a plain label is
    // also accepted as a whole-word prefix of it. Exact matches are preferred,
    // which keeps "iPhone 15" from swallowing "iPhone 15 Pro".
    const isPrefixAnswer = (labelText, answer) => {
      if (!labelText || !answer || labelText.length < 2) return false;
      const [longer, shorter] = answer.length >= labelText.length ? [answer, labelText] : [labelText, answer];
      return longer.startsWith(shorter) && /[\s.,:;!?]/.test(longer.charAt(shorter.length));
    };
    // A key is the first 64 characters of the normalised question, and the two
    // sides of this do not always see the same 64. The graded page appends the
    // player's feedback to a short question and the fresh attempt does not, and
    // a question can be renumbered between attempts, so an exact key match
    // silently loses answers the server confirmed seconds earlier. Fall back to
    // the longest stored key that is a prefix of this one, or the other way
    // round, with enough characters that it can only be the same question.
    const MIN_KEY_OVERLAP = 24;
    const lookup = (table, text) => {
      const key = keyOf(text || "");
      if (!key) return null;
      if (table[key]) return table[key];
      let best = null;
      for (const candidate of Object.keys(table)) {
        const overlap = Math.min(candidate.length, key.length);
        if (overlap < MIN_KEY_OVERLAP) continue;
        if (!candidate.startsWith(key) && !key.startsWith(candidate)) continue;
        if (!best || overlap > best.overlap) best = { value: table[candidate], overlap };
      }
      return best?.value || null;
    };

    const rejectedFor = (question) => {
      const heading = question.querySelector(
        ".questionText, .question_text, .question-title, .question_title, legend, h1, h2, h3, h4"
      );
      for (const source of [heading?.innerText, question.innerText]) {
        const hit = lookup(rejectedAnswersByKey, source);
        if (hit) return hit;
      }
      return { options: [], sets: [], orders: [] };
    };

    const knownFor = (question) => {
      const heading = question.querySelector(
        ".questionText, .question_text, .question-title, .question_title, legend, h1, h2, h3, h4"
      );
      for (const source of [heading?.innerText, question.innerText]) {
        const hit = lookup(knownAnswers, source);
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
      // The Hebrew packages phrase it as a tally instead — "נבחרו 3 מתוך 3",
      // "3 of 3 selected" — and reading only the first two forms left every one
      // of those questions guessed at with a single tick, which the player
      // counts as unanswered and refuses to submit.
      const tallied = text.match(/נבחרו\s+(\d+)\s+מתוך\s+(\d+)/);
      const want = asked
        ? (WORDS[String(asked[1]).toLowerCase()] || Number(asked[1]) || 1)
        : (tallied ? Number(tallied[2]) || Number(tallied[1]) || 1 : 1);

      const chosen = [];
      const settled = knownFor(question);
      if (!settled && (boxes.length || radios.length || selects.length)) {
        const heading = question.querySelector(
          ".questionText, .question_text, .question-title, .question_title, legend, h1, h2, h3, h4"
        );
        unresolved.push({
          key: keyOf(heading?.innerText || question.innerText),
          text: tidy(heading?.innerText || question.innerText).slice(0, 120)
        });
      }
      // Everything the server has already rejected for this question. Picking
      // around it is what turns a second attempt into a different guess rather
      // than the same one.
      const refused = rejectedFor(question);

      // Everything this run already knows about this question goes in first;
      // only what is left over is guessed.
      // A matching question is a set of dropdowns, and its confirmed answer is
      // the option each one should end on, in order. Excluding selects from
      // this block meant a matching question that had already been solved was
      // re-guessed from scratch on every visit.
      if (settled && selects.length && !boxes.length && !radios.length) {
        let applied = 0;
        selects.forEach((select, position) => {
          const answer = settled[position];
          if (!answer) return;
          const option = Array.from(select.options).find((candidate) =>
            tidy(candidate.textContent) === answer || isPrefixAnswer(tidy(candidate.textContent), answer));
          if (!option) return;
          select.selectedIndex = option.index;
          select.dispatchEvent(new Event("change", { bubbles: true }));
          applied++;
        });
        if (applied === selects.length) {
          picked.push({
            question: tidy((question.querySelector(".questionText, .question_text, .question-title, .question_title, legend, h1, h2, h3, h4") || question).innerText).slice(0, 300),
            chosen: selects.map((select) => tidy(select.options[select.selectedIndex]?.textContent || "")),
            fromLearned: true
          });
          continue;
        }
      }

      if (settled && (boxes.length || radios.length)) {
        const inputs = boxes.length ? boxes : radios;
        const rows = inputs.map((input) => ({ input, text: labelOf(input, question) }));
        const wanted = new Set();
        for (const answer of settled) {
          const row = rows.find((candidate) => candidate.text === answer) ||
            rows.find((candidate) => isPrefixAnswer(candidate.text, answer));
          if (row) wanted.add(row.input);
        }
        if (wanted.size === settled.length) {
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
        // A confirmed answer that names an option this question does not
        // appear to have. Applying only the half that matched would send a
        // half-answered question, which the player counts as unanswered, so
        // the question is guessed at instead — and the mismatch is reported,
        // because it means an answer the server confirmed is being thrown
        // away on every retry.
        unmatched.push({
          question: tidy((question.querySelector(".questionText, .question_text, .question-title, .question_title, legend, h1, h2, h3, h4") || question).innerText).slice(0, 160),
          wanted: settled.slice(0, 6),
          offered: rows.map((row) => row.text).slice(0, 8)
        });
      }

      if (selects.length) {
        // Leaving every dropdown on its first real option is one guess, and
        // repeating it is what made a matching question unsolvable: each retry
        // sent the attempt the server had just rejected. Instead the possible
        // assignments are enumerated in a fixed order and the first one that
        // has not already come back wrong is used.
        //
        // Matching questions are bijections — the same option list in every
        // dropdown, one option per row — so permutations are tried first and
        // the general case falls back to counting through the combinations.
        const choicesFor = (select) => Array.from(select.options)
          .map((option, index) => ({ index, text: tidy(option.textContent) }))
          // A leading blank or "choose one" row is a placeholder, not an answer.
          .filter((option) => option.index > 0 || (option.text && !/^(select|choose|בחר|בחרו)\b/i.test(option.text)));

        // Anything already chosen was put there by a stored key or by an
        // answer this run confirmed, and must not be overwritten by a guess;
        // only a question left on its placeholder is enumerated.
        const untouched = selects.every((select) => select.selectedIndex <= 0);
        const pools = untouched ? selects.map(choicesFor) : [];
        const tried = (refused.orders || []).map((order) => order.join("\u0000"));
        const asText = (assignment) => assignment.map((option) => option.text).join("\u0000");

        let assignment = null;
        const first = pools[0] || [];
        const bijection = pools.length > 1 && pools.length <= 8 &&
          pools.every((pool) => pool.length === first.length) &&
          first.length === pools.length;

        if (bijection) {
          // Every ordering of the shared option list, generated in one fixed
          // sequence so successive attempts walk through it rather than
          // re-rolling.
          const walk = (remaining, sofar) => {
            if (assignment) return;
            if (!remaining.length) {
              if (!tried.includes(asText(sofar))) assignment = [...sofar];
              return;
            }
            for (let index = 0; index < remaining.length && !assignment; index++) {
              sofar.push(remaining[index]);
              walk(remaining.filter((_, at) => at !== index), sofar);
              sofar.pop();
            }
          };
          walk(first, []);
        }

        if (!assignment) {
          // Not a bijection, or every ordering has been refused: count through
          // the independent combinations instead, skipping the tried ones.
          const total = pools.reduce((count, pool) => count * Math.max(pool.length, 1), 1);
          for (let n = 0; n < Math.min(total, 5000); n++) {
            let rest = n;
            const candidate = pools.map((pool) => {
              if (!pool.length) return { index: 0, text: "" };
              const option = pool[rest % pool.length];
              rest = Math.floor(rest / pool.length);
              return option;
            });
            if (!tried.includes(asText(candidate))) {
              assignment = candidate;
              break;
            }
          }
        }

        selects.forEach((select, position) => {
          const option = assignment?.[position];
          if (!option) return;
          if (select.selectedIndex === option.index) return;
          select.selectedIndex = option.index;
          select.dispatchEvent(new Event("change", { bubbles: true }));
        });
        for (const select of selects) {
          if (select.selectedIndex <= 0 && select.options.length > 1) {
            select.selectedIndex = 1;
            select.dispatchEvent(new Event("change", { bubbles: true }));
          }
          chosen.push(tidy(select.options[select.selectedIndex]?.textContent || ""));
        }
      } else if (boxes.length) {
        // Anything already ticked was put there deliberately, by a stored answer
        // or by one this run has confirmed, and it is right far more often than
        // a guess is. Only a question with nothing on it is guessed at.
        //
        // Clearing those to fit `want` is what made a nearly-right quiz
        // unsubmittable: `want` is 1 unless the question says otherwise, so
        // every correctly filled two-answer question came back down to one
        // selection, and the player counts a half-answered question as
        // unanswered and refuses the submission.
        if (!boxes.some((box) => box.checked)) {
          // Every set of the size the question asks for, in a fixed order, and
          // the first one the server has not already refused is the guess. A
          // "choose 3 of 5" has ten of them, so shifting a window along by one
          // — five sets — could never reach the rest of them.
          const size = Math.min(want, boxes.length);
          const rows = boxes.map((box) => labelOf(box, question));
          const sets = [];
          const build = (start, chosenIndexes) => {
            if (chosenIndexes.length === size) {
              sets.push([...chosenIndexes]);
              return;
            }
            for (let index = start; index < boxes.length; index++) {
              chosenIndexes.push(index);
              build(index + 1, chosenIndexes);
              chosenIndexes.pop();
            }
          };
          if (boxes.length <= 12) build(0, []);
          if (!sets.length) for (let index = 0; index < size; index++) sets.push([index]);

          const sameSet = (indexes, answers) => indexes.length === answers.length &&
            indexes.every((index) => answers.some((answer) =>
              answer === rows[index] || isPrefixAnswer(rows[index], answer)));
          const fresh = sets.find((candidate) =>
            !refused.sets.some((answers) => sameSet(candidate, answers)));

          for (const index of (fresh || sets[0])) boxes[index].click();
        }
        chosen.push(...boxes.filter((box) => box.checked).map((box) => labelOf(box, question)));
      } else if (radios.length) {
        if (!radios.some((radio) => radio.checked)) {
          // A single-answer option the server has called wrong is wrong; the
          // guess moves on to one it has not tried. The comparison is the loose
          // one, because a graded label comes back with the player's feedback
          // stuck on the end of it.
          const untried = radios.filter((radio) => {
            const text = labelOf(radio, question);
            return !refused.options.some((answer) => answer === text || isPrefixAnswer(text, answer));
          });
          (untried[0] || radios[0]).click();
        }
        chosen.push(...radios.filter((radio) => radio.checked).map((radio) => labelOf(radio, question)));
      } else {
        // Neither a choice nor a dropdown. A free-text or scale question still
        // has to carry something or the player counts the whole quiz as
        // unanswered and refuses the submission, taking every other question on
        // it down with one it could not fill.
        const texts = Array.from(question.querySelectorAll('textarea, input[type="text"], input[type="email"], input[type="number"], [contenteditable="true"]'));
        const ranges = Array.from(question.querySelectorAll('input[type="range"]'));
        if (!texts.length && !ranges.length) continue;

        for (const field of texts) {
          if (tidy(field.value || field.innerText)) continue;
          const answer = field.tagName === "INPUT" && field.type === "number" ? "1" : "N/A";
          if (field.isContentEditable) field.innerText = answer;
          else field.value = answer;
          field.dispatchEvent(new Event("input", { bubbles: true }));
          field.dispatchEvent(new Event("change", { bubbles: true }));
          chosen.push(answer);
        }
        for (const slider of ranges) {
          const min = Number(slider.min || 0);
          const max = Number(slider.max || 100);
          slider.value = String(Math.round((min + max) / 2));
          slider.dispatchEvent(new Event("input", { bubbles: true }));
          slider.dispatchEvent(new Event("change", { bubbles: true }));
          chosen.push(slider.value);
        }
        if (!chosen.length) continue;
      }

      const heading = question.querySelector(
        ".questionText, .question_text, .question-title, .question_title, legend, h1, h2, h3, h4"
      );
      picked.push({ question: tidy(heading?.innerText || question.innerText).slice(0, 300), chosen });
    }

    // Returned as an object: a property hung off the array would be dropped by
    // the structured clone that carries this back out of the page.
    return { picked, unmatched, unresolved };
  }, [known, rejected]);
}

// An answer the server confirmed that no longer matches anything on the page is
// a key the run is throwing away on every retry, and it looks from the outside
// like a quiz that simply refuses to be solved. Say so.
function reportUnmatchedLearned(filled) {
  for (const miss of filled?.unmatched || []) {
    log(`A confirmed answer no longer matches this question: "${miss.question}" wants ` +
      `[${miss.wanted.join(" | ")}] but the page offers [${miss.offered.join(" | ")}].`);
  }
  for (const miss of filled?.unresolved || []) {
    // Only worth saying when the memory does hold this question under some
    // other key; a question nobody has ever answered is simply unknown.
    if (!learnedAnswers.has(miss.key)) continue;
    log(`Key mismatch: this page reads the question as "${miss.key}", which is not the key its confirmed answer was filed under.`);
  }
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
      await assertSignedIn(itemPage);
      return;
    } catch (error) {
      if (error?.signedOut) throw error;
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

// The main frame is searched too: a module the site plays itself has its Play
// control on the page rather than inside a package iframe.
async function startVisibleVideoControls(targetPage) {
  for (const frame of targetPage.frames()) {
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

// A video that never reports a duration is given a flat cap rather than the
// rest of the day, and any video whose playhead stops moving for this long is
// abandoned: playback is not what records completion, so nothing is lost by
// walking away from one that has stalled.
const VIDEO_UNKNOWN_DURATION_MAX_MS = 15 * 60 * 1000;
const VIDEO_STALL_MS = 90000;
const VIDEO_PLAYBACK_RATE = 16;

async function playAllVideos(targetPage) {
  const initialVideoCount = (await Promise.all(targetPage.frames().map((frame) =>
    frame.locator("video").count().catch(() => 0)
  ))).reduce((total, count) => total + count, 0);
  if (!initialVideoCount) await startVisibleVideoControls(targetPage);
  let played = 0;

  for (const frame of targetPage.frames()) {
    const videos = frame.locator("video");
    const count = await videos.count().catch(() => 0);

    for (let index = 0; index < count; index++) {
      const video = videos.nth(index);
      await video.scrollIntoViewIfNeeded().catch(() => {});
      const initial = await video.evaluate(async (element) => {
        if (element.ended) element.currentTime = 0;
        // Keep the media lifecycle genuine (including its `ended` event), but
        // do not make a whole-site automation sit through every clip in real
        // time. Chromium supports 16x playback and the loop below reapplies it
        // if a package resets the rate while playing.
        element.playbackRate = 16;
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
        ? Math.max(30000, ((initial.duration - initial.currentTime) / VIDEO_PLAYBACK_RATE + 30) * 1000)
        : VIDEO_UNKNOWN_DURATION_MAX_MS;
      const deadline = Date.now() + maximumWait;
      // A video that reports no duration used to be waited on for four hours,
      // and one whose stream dies mid-play was waited on for its whole length
      // plus two minutes. Either one stops the run dead in the middle of a
      // module, which is what a run that "gets stuck" is doing. Playback is
      // only worth waiting on while the playhead is still moving.
      let furthest = initial.currentTime || 0;
      let movedAt = Date.now();

      while (Date.now() < deadline) {
        const state = await video.evaluate(async (element) => {
          if (element.playbackRate !== 16) element.playbackRate = 16;
          if (element.paused && !element.ended) await element.play().catch(() => {});
          return { ended: element.ended, currentTime: element.currentTime, duration: element.duration };
        }).catch(() => null);
        if (!state) break;
        if (state.ended || (Number.isFinite(state.duration) && state.currentTime >= state.duration - 0.25)) break;
        if (state.currentTime > furthest + 0.25) {
          furthest = state.currentTime;
          movedAt = Date.now();
        } else if (Date.now() - movedAt > VIDEO_STALL_MS) {
          log(`Video ${played} stopped advancing at ${Math.round(furthest)}s; leaving it and moving on.`);
          break;
        }
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
function createRunState({ onProgress = null, skipCompleted = true, limit = 0, mode = "run", submitUnverified = false, blind = false, targetXp = 0, xpPages = [] } = {}) {
  return {
    startedAt: new Date(),
    onProgress,
    skipCompleted,
    limit,
    // The XP the run is working towards, and the pages it is read from. Both
    // are held on the state so the walk can stop the moment it is reached
    // rather than at the end of a pass that may still have hours left in it.
    targetXp,
    xpPages,
    targetReached: false,
    sinceXpCheck: 0,
    xpLatest: null,
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
    // Sections a pass has been all the way through and found nothing left in:
    // no locked row, no unfinished module, nothing to retry. Unlike
    // `visitedContainers` this survives between passes, so a later pass spends
    // its page loads on the sections that are still missing something.
    exhaustedContainers: new Set(),
    // Sections a pass opened and found nothing at all in. Kept across passes so
    // one that reads empty twice is written off rather than re-opened on each
    // of the run's remaining passes.
    emptyContainers: new Set(),
    // Sections that read as fully completed and were passed over on the first
    // pass. They are only worth opening for the optional modules a completion
    // badge does not count, and doing that before any of the unfinished work
    // spends the first hours of a run inside material the account has already
    // finished. They are walked from the second pass onwards.
    deferredCompleted: new Set(),
    // Which pass of the site the run is on. The first one goes after work that
    // is visibly outstanding; later ones look inside the finished sections too.
    pass: 1,
    deferred: new Map(),
    blocked: 0,
    chapters: new Map(),
    // Every container any listing page offered, walked or not. A run that
    // reaches fewer sections than a page lists used to leave no trace of the
    // ones it passed over; this is where they show up.
    containersSeen: new Map()
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

// Every container a listing page offered, and what the walk did with it. Keyed
// by id so a section listed under two parents is one row, and so a later pass
// that gets into a section it had to defer overwrites the earlier verdict.
function noteContainer(state, node, parent, outcome) {
  state.containersSeen.set(node.id, {
    title: node.title,
    url: node.url,
    parent: parent || null,
    completed: Boolean(node.completed),
    locked: Boolean(node.locked),
    evidence: node.evidence || [],
    outcome
  });
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
    containersSeen: [...state.containersSeen.values()],
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

// How many modules go by between XP readings during a walk. A pass over the
// whole site takes hours, so a target checked only between passes is a target
// the run blows straight past; checked here, the walk stops within a module or
// two of reaching it. The read costs one background tab, which is why it is not
// done after every single module.
const XP_CHECK_EVERY = 8;

function limitReached(state) {
  if (state.limit > 0 && state.modulesProcessed >= state.limit) return true;
  return Boolean(state.targetReached);
}

// Read the total mid-walk and stop the run the moment the target is in hand.
async function checkXpTarget(state, { force = false } = {}) {
  if (!state.targetXp || state.targetReached) return;
  state.sinceXpCheck = (state.sinceXpCheck || 0) + 1;
  if (!force && state.sinceXpCheck < XP_CHECK_EVERY) return;
  state.sinceXpCheck = 0;

  const xp = await readXpAside(state.xpPages || []).catch(() => null);
  if (xp === null) return;
  state.xpLatest = xp;
  const short = state.targetXp - xp;
  log(short > 0
    ? `XP now ${xp.toLocaleString()}; ${short.toLocaleString()} short of the ${state.targetXp.toLocaleString()} target.`
    : `XP now ${xp.toLocaleString()}: the ${state.targetXp.toLocaleString()} target is reached.`);
  if (short <= 0) state.targetReached = true;
}

// Nothing inside a module is allowed to hold the whole run. Every wait in here
// is bounded on its own, but a renderer that stops answering hangs an
// `evaluate` that no timeout of its own covers, and a run that "gets stuck" is
// sitting in one of those. The module is abandoned, its tab is closed, and the
// walk carries on to the next one.
const MODULE_WATCHDOG_MS = 25 * 60 * 1000;

// How many times one quiz is answered and submitted in a single visit. Enough
// for every option of a four-option question to be tried once, plus a last one
// that puts the confirmed answers together.
const MAX_QUIZ_ATTEMPTS_IN_PLACE = 6;

function withTimeout(promise, ms, message) {
  let timer = null;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); })
  ]).finally(() => { if (timer) clearTimeout(timer); });
}

// Open one module in its own tab, play whatever it holds, and either answer its
// quiz or scroll its reading material to the player's completion threshold.
// Throws on anything that stops it; the caller turns that into a result row.
async function runModule(item, state, { label = "", listPage = null } = {}, held) {
  let itemPage = null;
  // Remembered so a quiz that fails before grading is still reported as an exam
  // result rather than a generic processing error.
  let quizName = null;

  log(`${label}Opening ${item.title || item.url}`);
  itemPage = await session().context.newPage();
  held.page = itemPage;
  session().page = itemPage;
  await openModule(itemPage, item.url);

  const ready = await loadModulePlayer(itemPage);
  if (!ready) throw new Error(`No content player loaded for this module after ${MODULE_LOAD_ATTEMPTS} attempts.`);

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

  held.isQuiz = Boolean(ready.hasAssessments);

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
    held.page = null;
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
      held.quizName = quizName;
      run = await runExam(detected.id, false, { preserveLogs: true });
      if (run.failed > 0) {
        // A stored answer that names an option this quiz does not have leaves
        // its question empty, and the player refuses a submission with an
        // empty question, so the whole module used to fail on one stale key.
        // What is left is filled the same way an unknown quiz is, and the
        // grading then says which of the guesses were right.
        if (!state.blind && !state.submitUnverified) {
          throw new Error(`Quiz not submitted because ${run.failed} of ${run.total} questions failed to fill.`);
        }
        log(`${run.failed} of ${run.total} stored answers would not apply; filling what is left blind.`);
        answeredBlind = true;
      }
      // A partial answer-bank entry can match perfectly while the live quiz has
      // additional questions. `run.failed` only describes stored questions, so
      // without this check the extra live questions remain empty and Submit is
      // rejected as "unanswered". Blind/explicit-unverified runs are allowed to
      // fill only that remainder; conservative runs still stop before spending
      // an attempt and report the missing question through the pre-flight error.
      if (ready.questions > run.total && (state.blind || state.submitUnverified)) {
        log(`The live quiz has ${ready.questions} question(s), but exams.js has ${run.total}; filling the missing ${ready.questions - run.total} question(s) blind.`);
        answeredBlind = true;
      } else if (ready.questions > run.total) {
        const missing = ready.questions - run.total;
        log(`The live quiz has ${ready.questions} question(s), but exams.js has ${run.total}; capturing ${missing} missing question(s) and keeping this attempt unsubmitted.`);
        const capture = await captureCurrentExam().catch((error) => {
          log(`Could not capture the partial quiz: ${error instanceof Error ? error.message : String(error)}`);
          return null;
        });
        if (capture) {
          capture.module = item.title;
          capture.chapter = item.chapter || null;
          capture.reason = "partial-answer-bank";
          state.captures.push(capture);
        }
      }
    } else if (state.blind) {
      quizName = detected?.name || null;
      held.quizName = quizName;
      answeredBlind = true;
      log("No stored answers for this quiz. Answering it blind so the grade reports the key back.");
    } else {
      const capture = await captureCurrentExam().catch((captureError) => {
        log(`Could not capture the unknown quiz: ${captureError instanceof Error ? captureError.message : String(captureError)}`);
        return null;
      });
      if (capture) {
        capture.module = item.title;
        capture.chapter = item.chapter || null;
        capture.reason = "unknown-answer-bank";
        state.captures.push(capture);
        log(`Captured ${capture.questions.length} question(s) from unknown quiz "${item.title}" for exams.js.`);
      }
      throw new Error(`No stored answers match this quiz; "${detected?.name || "nothing"}" was the closest by title. Capture it and add it to exams.js.`);
    }

    if (answeredBlind) {
      const filled = await fillBlindly(
        ready.frame,
        Object.fromEntries(learnedAnswers),
        Object.fromEntries(rejectedAnswers)
      );
      const picks = filled.picked;
      if (!picks.length) throw new Error("Nothing on this quiz could be answered blind.");
      const settled = picks.filter((pick) => pick.fromLearned).length;
      log(`Answered ${picks.length} question(s) blind` +
        (settled ? `, ${settled} of them from answers this run already confirmed.` : "."));
      reportUnmatchedLearned(filled);
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
      held.page = null;
      return;
    }

    // One quiz, as many attempts as the player will give it. Every grade says
    // which questions were right — those are kept — and which were wrong —
    // those are cleared and guessed at differently. Leaving that to the next
    // pass over the whole site meant one guess per quiz per pass, which is why
    // a five-question quiz with nothing stored never came out passed.
    let graded = null;
    let percentage = null;
    let threshold = 80;
    let passed = null;
    let learned = null;
    let attempt = 1;

    const budget = await readAttemptState(ready.frame);
    if (budget) {
      if (budget.lockedOut) {
        log(`The player reports this quiz as locked out; no further attempt can be made at it.`);
      } else if (budget.limitedAttempts && Number.isFinite(budget.remainingAttempts)) {
        log(`This quiz allows ${budget.remainingAttempts} more attempt(s)${budget.numberOfAttempts ? ` of ${budget.numberOfAttempts}` : ""}.`);
      }
    }

    while (true) {
      await waitRandom(itemPage, 3, 8, `Before submitting the quiz${attempt > 1 ? ` (attempt ${attempt})` : ""}`);
      await fillUntilAnswered(itemPage, ready.frame).catch(() => {});
      graded = await submitAssessment(itemPage, ready.frame);
      state.examsSubmitted++;
      // Sales Coach quizzes pass on a threshold (completionScore, 80 on the
      // WISE modules), not on a perfect score. A quiz whose answers were
      // already recorded server-side comes back ungraded, which is not a fail.
      percentage = graded.total > 0 ? Math.round((graded.correct / graded.total) * 100) : null;
      // Some packages omit completionScore from their runtime state even though
      // the results UI still applies the threshold, so do not require 100%.
      threshold = Number.isFinite(graded.completionScore) ? graded.completionScore : 80;
      passed = percentage === null ? null : percentage >= threshold;

      // Whatever the server just graded is the best answer key available. Keep
      // it whether the attempt passed or not: a failed attempt still confirms
      // every question it did mark correct.
      const fromThisAttempt = learnFromGrading(graded, {
        exam: quizName || item.title,
        module: item.title,
        chapter: item.chapter || null,
        url: item.url,
        percentage,
        threshold
      });
      if (fromThisAttempt) {
        // One entry per quiz, not one per attempt: the latest grade knows
        // everything the earlier ones did.
        if (learned) state.learned.splice(state.learned.indexOf(learned), 1);
        learned = fromThisAttempt;
        state.learned.push(learned);
        const solved = learned.questions.filter((question) => question.confirmedAnswers).length;
        const fresh = rememberLearned(learned);
        state.answersLearned = (state.answersLearned || 0) + fresh;
        log(`Learned ${solved} of ${learned.questions.length} answer(s) for "${learned.exam}"` +
          (fresh ? `, ${fresh} of them new to this run.` : "."));
      }

      if (passed !== false) break;
      if (attempt >= MAX_QUIZ_ATTEMPTS_IN_PLACE) {
        log(`Stopping after ${attempt} attempt(s) at this quiz; the rest is left to a later pass.`);
        break;
      }
      // A run that was told not to spend attempts on guesses does not spend
      // them here either.
      if (!state.blind && !state.submitUnverified) break;

      // The site's own attempt counter, not the retry heuristics, is the last
      // word: a quiz that says it is out of attempts is not clicked at again,
      // and one that is locked out is left for good rather than re-opened on
      // every remaining pass.
      const left = await readAttemptState(ready.frame);
      if (left?.lockedOut) {
        log("The player has locked this quiz out; leaving it.");
        break;
      }
      if (left?.limitedAttempts && Number.isFinite(left.remainingAttempts) && left.remainingAttempts <= 0) {
        log("The player reports no attempts left at this quiz; leaving it.");
        break;
      }

      if (!await startAnotherAttempt(itemPage, ready.frame)) {
        log("The player is not offering another attempt at this quiz.");
        break;
      }

      // Put the answer bank back first. The player wipes every selection when it
      // offers another attempt, so a quiz that scored 9 of 10 from exams.js
      // starts the retry blank, and rebuilding it only from what this run has
      // confirmed threw away every stored answer — which is how a 90% attempt
      // was followed by a 40% one. Refilling from the same key that scored 90%
      // and only then taking out what the grade rejected keeps each attempt at
      // least as good as the one before it.
      if (detected?.matchedQuestions) {
        const refilled = await runExam(detected.id, false, { preserveLogs: true, immediate: true })
          .catch((error) => {
            log(`Could not re-apply the stored answers: ${error instanceof Error ? error.message : String(error)}`);
            return null;
          });
        if (refilled) log(`Re-applied ${refilled.success} stored answer(s) before this attempt.`);
      }
      const cleared = await clearRejectedQuestions(ready.frame, graded);
      const filled = await fillBlindly(
        ready.frame,
        Object.fromEntries(learnedAnswers),
        Object.fromEntries(rejectedAnswers)
      );
      const picks = filled.picked;
      if (!picks.length) {
        log("Nothing could be filled in for another attempt.");
        break;
      }
      answeredBlind = true;
      attempt++;
      const settled = picks.filter((pick) => pick.fromLearned).length;
      log(`Attempt ${attempt} at "${quizName || item.title}": cleared ${cleared} rejected answer(s), ` +
        `kept ${settled} confirmed one(s), guessed the rest around what the last grade refused.`);
      reportUnmatchedLearned(filled);
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
      attempts: attempt,
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
        ? `${attempt} attempt(s) at "${quizName || item.title}" ended at ${percentage}% against a ${threshold}% threshold; ${unsolved} question(s) still unsolved.`
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
    // A resource that never reached the player's threshold earns no XP, so it
    // is not finished work. Marking it retryable is what brings a later pass
    // back to it instead of leaving it silently short in the report.
    if (!scrolledEnough) {
      markRetryable(state, item);
      log("This reading module did not reach the completion threshold; a later pass will try it again.");
    }
  }

  // Completion is reported to the server from the page; give that call time to
  // leave before the tab goes away.
  await itemPage.waitForTimeout(1500);
  await itemPage.close();
  itemPage = null;
  held.page = null;
}

async function processModule(item, state, { label = "", listPage = null } = {}) {
  // Filled in by the run itself, and read here whether it finished or not.
  const held = { page: null, quizName: null, isQuiz: false };

  if (item?.id) state.attempts.set(item.id, (state.attempts.get(item.id) || 0) + 1);

  try {
    await withTimeout(
      runModule(item, state, { label, listPage }, held),
      MODULE_WATCHDOG_MS,
      `This module was still going after ${Math.round(MODULE_WATCHDOG_MS / 60000)} minutes and was abandoned so the run could carry on.`
    );
  } catch (error) {
    if (error?.signedOut) {
      log(error.message);
      if (held.page && !held.page.isClosed()) await held.page.close().catch(() => {});
      throw error;
    }
    state.failed++;
    const message = error instanceof Error ? error.message : String(error);
    log(`Failed: ${item.title || item.url}: ${message}`);
    // Every quiz module belongs in the report, including the ones that never
    // reached grading, so a whole chapter's answer problems land in one file.
    markRetryable(state, item);
    recordResult(state, item, (held.quizName || held.isQuiz)
      ? {
          title: held.quizName || item.title || item.url,
          module: item.title,
          chapter: item.chapter || null,
          type: "quiz",
          status: "failed",
          passed: false,
          identified: Boolean(held.quizName),
          errors: [{ reason: message }],
          error: message
        }
      : { title: item.title || item.url, chapter: item.chapter || null, status: "failed", error: message });
    // The abandoned tab is closed here rather than inside the run, which by now
    // may still be sitting in a call that will never come back.
    if (held.page && !held.page.isClosed()) await held.page.close().catch(() => {});
  }

  state.modulesProcessed++;
  await checkXpTarget(state).catch(() => {});
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
  await assertSignedIn(listPage);
  await openAllAccordions(listPage).catch(() => {});
  await listPage.waitForTimeout(500);
}

// Rails below the fold are only built once they are scrolled to, so a listing
// has to be walked to the bottom before it can be read.
async function revealListing(targetPage) {
  await targetPage.evaluate(async () => {
    const pause = () => new Promise((resolve) => setTimeout(resolve, 250));
    let previous = -1;
    for (let step = 0; step < 12 && document.body.scrollHeight !== previous; step++) {
      previous = document.body.scrollHeight;
      window.scrollTo(0, document.body.scrollHeight);
      await pause();
    }
    window.scrollTo(0, 0);
  }).catch(() => {});
}

// How long the item count has to hold still before a listing counts as loaded.
const LISTING_SETTLE_MS = 2500;
// How long a page that has painted but listed nothing is given before it is
// called a leaf. The Academy program page paints its header and back button
// seconds before its card rails arrive, so anything still building gets the
// longer grace rather than the short one.
const EMPTY_LISTING_MS = 4000;
const BUILDING_LISTING_MS = 20000;

// Is this page still assembling its listing? A spinner, a skeleton, or a
// card-shaped row that has not yet grown the link inside it all mean the cards
// are on their way and an empty read says nothing yet.
async function listingStillBuilding(targetPage) {
  return targetPage.evaluate(() => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      const style = getComputedStyle(element);
      return style.display !== "none" && style.visibility !== "hidden";
    };
    const busy = document.querySelector(
      "[aria-busy='true'], [class*='spinner' i], [class*='loading' i], [class*='skeleton' i], [class*='shimmer' i]"
    );
    if (busy && visible(busy)) return true;
    for (const row of document.querySelectorAll(".entity, [role='listitem'], [class*='card' i]")) {
      if (visible(row) && row.innerText.trim()) return true;
    }
    return false;
  }).catch(() => false);
}

async function waitForChapterItems(targetPage, timeoutMs = EXAM_LOAD_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  let nodes = [];
  let renderedSince = null;
  let mostSeen = 0;
  let steadySince = null;

  while (Date.now() < deadline) {
    await openAllAccordions(targetPage).catch(() => {});
    await revealListing(targetPage);
    nodes = await collectNodes(targetPage);
    // Returning on the first card found is why a For You page reported one
    // section: the Academy card paints seconds before the rails under it.
    if (nodes.length) {
      if (nodes.length > mostSeen) {
        mostSeen = nodes.length;
        steadySince = Date.now();
      } else if (steadySince && Date.now() - steadySince >= LISTING_SETTLE_MS) {
        return nodes;
      }
      await targetPage.waitForTimeout(500);
      continue;
    }

    // A page that has already painted its own copy and still lists nothing is
    // a leaf, not a slow load. Waiting out the full timeout on every one of
    // those adds up across a whole program. The header of a listing page paints
    // first, though, so "there is text on screen" on its own used to end the
    // wait four seconds into a load and report the Academy as empty.
    const rendered = clean(await targetPage.locator("body").innerText().catch(() => "")).length > 40;
    if (rendered) {
      if (renderedSince === null) renderedSince = Date.now();
      const grace = await listingStillBuilding(targetPage) ? BUILDING_LISTING_MS : EMPTY_LISTING_MS;
      if (Date.now() - renderedSince > grace) return nodes;
    } else {
      renderedSince = null;
    }
    await targetPage.waitForTimeout(500);
  }
  return nodes;
}

// A listing page that lists nothing is far more often a lost race than a page
// with nothing on it: the rails arrive well after the header, and a section the
// account has only just unlocked can take a reload or two to admit it. So an
// empty read is reloaded rather than believed the first time.
const LISTING_LOAD_ATTEMPTS = 3;

async function loadListingItems(listPage, url, { attempts = LISTING_LOAD_ATTEMPTS, indent = "" } = {}) {
  let nodes = [];
  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (attempt === 1) {
      await openListing(listPage, url);
    } else {
      log(`${indent}Nothing listed yet; reloading (attempt ${attempt} of ${attempts}).`);
      await listPage.reload({ waitUntil: "domcontentloaded", timeout: EXAM_LOAD_TIMEOUT_MS }).catch(() => {});
      await listPage.waitForTimeout(2000 * attempt);
      await openAllAccordions(listPage).catch(() => {});
    }
    nodes = await waitForChapterItems(listPage, EXAM_LOAD_TIMEOUT_MS);
    if (nodes.length) return nodes;
  }
  return nodes;
}

// Re-reads a listing the run has just changed underneath itself. The page is
// opened from scratch, because a section whose first module has only just been
// finished keeps serving its old locked state for a few seconds afterwards.
async function reopenListing(listPage, url, indent = "") {
  log(`${indent}Re-reading the section to see what has unlocked.`);
  await listPage.waitForTimeout(3000);
  return loadListingItems(listPage, url, { indent }).catch(() => []);
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
    return { id: containerId(listPage.url()), url: listPage.url().split("#")[0], title: "Apple Professional Academy" };
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
        return { id: containerId(listPage.url()), url: listPage.url().split("#")[0], title: "Apple Professional Academy" };
      }
    }
    throw new Error(`Could not find Apple Professional Academy from ${listPage.url()}. Open it in the connected tab and try again.`);
  }

  log(`Opening Apple Professional Academy: ${link.url}`);
  // Same treatment every other listing gets: this page loses the race often
  // enough that one empty read is not an answer.
  const nodes = await loadListingItems(listPage, link.url, { indent: "  " });
  if (!nodes.length) {
    throw new Error("Apple Professional Academy opened, but nothing was listed on it. Wait for the page to finish loading and try again.");
  }
  log(`Apple Professional Academy is ready with ${nodes.length} listed item${nodes.length === 1 ? "" : "s"}.`);
  return { id: containerId(link.url), url: link.url, title: link.title || "Apple Professional Academy" };
}

// Sections that still have work in them are walked first. The site marks a
// section completed when the items it requires are done, so a run that starts
// with those spends its first hours re-reading finished material while the
// unfinished sections wait.
function workFirst(nodes) {
  return [...nodes].sort((a, b) => Number(Boolean(a.completed)) - Number(Boolean(b.completed)));
}

// A section hands its modules out one at a time: the introduction is open and
// everything after it is locked until that one is finished, and the listing
// keeps saying "locked" for a while afterwards. So a section is swept more than
// once, reloading between sweeps, rather than leaving the rest of it to a whole
// extra pass over the site.
const CONTAINER_UNLOCK_ROUNDS = 4;

// Depth-first through chapters and collections, running every module it reaches.
// Returns true when the walk got all the way through this section and found
// nothing left in it: every module done, nothing locked, nothing to retry, and
// every sub-section the same. That is what lets a later pass leave it alone.
async function walkContainer(listPage, container, state, depth = 0) {
  if (state.visitedContainers.has(container.id)) return state.exhaustedContainers.has(container.id);
  state.visitedContainers.add(container.id);
  const indent = "  ".repeat(depth);

  if (depth > ACADEMY_MAX_DEPTH) {
    log(`${indent}Not descending past ${ACADEMY_MAX_DEPTH} levels at "${container.title}".`);
    return false;
  }
  if (limitReached(state)) return false;

  log(`${indent}Entering "${container.title || container.url}".`);
  let children;
  try {
    children = await loadListingItems(listPage, container.url, { indent: `${indent}  ` });
  } catch (error) {
    if (error?.signedOut) throw error;
    log(`${indent}Could not open "${container.title}": ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
  session().page = listPage;

  const progress = await readChapterProgress(listPage);
  if (progress) log(`${indent}"${container.title}": ${progress.completed} of ${progress.required} done.`);

  const blocked = await countLockedRows(listPage);
  if (blocked) {
    state.blocked += blocked;
    log(`${indent}${blocked} row(s) inside "${container.title}" are still locked and carry no link.`);
  }

  // Anything the walk could not finish here. While this is non-zero the section
  // is worth coming back to on a later pass.
  let unfinished = blocked;

  if (!children.length) {
    // A course page that holds an instructor-led workshop really does list
    // nothing, and treating that as unfinished work kept every section above it
    // unfinished too, which is what made each of the run's later passes re-walk
    // the entire tree to re-read the same empty pages. Nothing locked is
    // showing here, so there is nothing to come back for — but one empty read
    // could still be a listing that failed to build, so it is only written off
    // the second time a pass finds it empty.
    if (blocked) {
      log(`${indent}Nothing is listed inside "${container.title}" yet; ${blocked} row(s) are still locked.`);
      return false;
    }
    if (state.emptyContainers.has(container.id)) {
      log(`${indent}"${container.title}" is empty again; not opening it for the rest of this run.`);
      state.exhaustedContainers.add(container.id);
      return true;
    }
    state.emptyContainers.add(container.id);
    log(`${indent}Nothing is listed inside "${container.title}".`);
    return false;
  }
  // It has content after all, so an earlier empty read was a listing that had
  // not finished building.
  state.emptyContainers.delete(container.id);

  // Sub-sections are gathered across every sweep, because one of them can be
  // locked on the first read and listed on a later one.
  const subContainers = new Map();
  let announced = false;

  for (let round = 1; round <= CONTAINER_UNLOCK_ROUNDS; round++) {
    if (round > 1) {
      children = await reopenListing(listPage, container.url, `${indent}  `);
      session().page = listPage;
      if (!children.length) break;
    }

    const modules = children.filter((child) => child.kind === "module");
    for (const child of children) {
      if (child.kind === "container" && !subContainers.has(child.id)) subContainers.set(child.id, child);
    }

    if (!announced) {
      log(`${indent}${modules.length} module(s) and ${subContainers.size} sub-section(s) inside.`);
      announced = true;
      // Keyed by URL so a section walked again on a later pass is updated in
      // place rather than reported twice.
      state.chapters.set(container.url, {
        title: container.title,
        url: container.url,
        depth,
        progress,
        modules: modules.length,
        subSections: subContainers.size
      });
    }

    let ran = 0;
    let locked = 0;
    let index = 0;

    for (const module of modules) {
      if (state.processedModules.has(module.id)) continue;
      if (module.locked) {
        locked++;
        state.deferred.set(module.id, { ...module, chapter: container.title });
        if (round === 1) log(`${indent}  Locked for now: "${module.title}".`);
        continue;
      }
      if (state.skipCompleted && module.completed) {
        state.processedModules.add(module.id);
        state.skipped++;
        continue;
      }
      if (limitReached(state)) {
        log(`${indent}Reached the ${state.limit}-module limit for this run.`);
        return false;
      }

      // It is open now, so it is no longer something the run is waiting on.
      state.deferred.delete(module.id);
      state.processedModules.add(module.id);
      state.pending = state.pending + 1;
      if (index > 0) await waitRandom(listPage, 1, 3, "Between modules");
      index++;
      ran++;
      // `retryable` carries the attempt number, so a fresh mark against this
      // module is what says this attempt did not settle it. Comparing the mark
      // rather than its presence keeps a module that failed on an earlier pass
      // and passed on this one from holding its section open for ever.
      const retryMark = state.retryable.get(module.id);
      await processModule({ ...module, chapter: container.title }, state, {
        label: `${indent}  [${state.modulesProcessed + 1}] `,
        listPage
      });
      // A module that did not come out passed is one this section is still
      // waiting on, so the section stays on the list for the next pass.
      if (state.retryable.get(module.id) !== retryMark) unfinished++;
      // Each module ran in its own tab; come back to the listing for the next.
      if (!listPage.isClosed()) {
        await listPage.bringToFront().catch(() => {});
        session().page = listPage;
      }
    }

    // Nothing here is waiting on a lock, so a re-read has nothing to add.
    if (!locked) break;
    unfinished += locked;
    if (!ran) {
      log(`${indent}${locked} module(s) in "${container.title}" are still locked, and this sweep opened nothing.`);
      break;
    }
    if (round === CONTAINER_UNLOCK_ROUNDS) {
      log(`${indent}${locked} module(s) in "${container.title}" are still locked; leaving them for the next pass.`);
    }
  }

  for (const child of workFirst([...subContainers.values()])) {
    if (limitReached(state)) {
      noteContainer(state, child, container.title, "limit-reached");
      return false;
    }
    // Walked already on this pass, under some other parent. Whether this
    // section still counts as finished follows what that walk found.
    if (state.visitedContainers.has(child.id)) {
      if (!state.exhaustedContainers.has(child.id)) unfinished++;
      continue;
    }
    if (child.locked) {
      unfinished++;
      state.deferred.set(child.id, { ...child, chapter: container.title });
      noteContainer(state, child, container.title, "locked");
      log(`${indent}  Locked sub-section for now: "${child.title}".`);
      continue;
    }
    // An earlier pass already went through this one and found nothing left in
    // it. Opening it again would cost a page load to re-read a section the run
    // has already settled, which is what made a long run spend its later passes
    // inside finished material.
    if (state.exhaustedContainers.has(child.id)) {
      noteContainer(state, child, container.title, "already-finished");
      continue;
    }
    // A container's completion badge counts only the items it requires, so a
    // collection can read as done while optional modules under it have never
    // been opened. It is still worth opening — but not before everything that
    // is visibly unfinished, which is why the first pass notes it and moves on.
    // The section stays counted as unfinished, so a later pass comes back and
    // descends it.
    if (child.completed && state.pass === 1) {
      state.deferredCompleted.add(child.id);
      unfinished++;
      noteContainer(state, child, container.title, "deferred-completed");
      log(`${indent}  "${child.title}" reads as completed; leaving it until the unfinished work is done.`);
      continue;
    }
    if (child.completed) log(`${indent}  "${child.title}" reads as completed; looking inside anyway.`);
    // The tab is left inside the child, which does not matter: the next
    // sibling is opened by its own URL rather than by going back.
    noteContainer(state, child, container.title, "walked");
    if (!await walkContainer(listPage, child, state, depth + 1)) unfinished++;
  }

  if (!unfinished) {
    state.exhaustedContainers.add(container.id);
    return true;
  }
  return false;
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
    state.pass = pass;
    state.visitedContainers = new Set();
    state.deferred = new Map();
    state.deferredCompleted = new Set();
    state.blocked = 0;
    if (pass > 1) log(`Pass ${pass}: re-walking the Academy to pick up anything that unlocked.`);

    await walkContainer(listPage, root, state, 0);

    const gained = state.modulesProcessed - processedBefore;
    // Sections passed over because they read as completed are work this run has
    // not done yet, so they hold the run open for another pass the same way a
    // locked row does. Without this a first pass that found nothing outstanding
    // would stop before ever looking inside them.
    const stillShut = state.deferred.size + state.blocked + state.deferredCompleted.size;
    if (state.deferredCompleted.size) {
      log(`${state.deferredCompleted.size} section(s) that read as completed were left for the next pass.`);
    }
    if (state.exhaustedContainers.size) {
      log(`${state.exhaustedContainers.size} section(s) have nothing left in them; a later pass will not open them again.`);
    }

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
    if (!gained && !state.deferredCompleted.size) {
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

// Destinations that are account tools rather than learning content, matched on
// the path: the For You link's own text reads "For You 1 unread alerts", so
// matching link text would throw away the main tab.
// Achievements and Events belong here too: one is a wall of badges and the
// other a list of invitations, and neither holds a module to run.
const SITE_HUB_SKIP = /^\/home\/(profile|account|settings?|manage|alerts?|notifications?|saved(-content)?|achievements?|events?|search|help|support|feedback|sign-?out|log-?out)$/i;

function hubPath(url) {
  try {
    return new URL(url).pathname.replace(/\/$/, "");
  } catch {
    return url;
  }
}

// Pages that tend to carry the account's XP total, tried in turn.
const XP_PAGE_HINTS = /\/home\/(achievements|profile)$/i;
const SITE_HOME = "https://salescoach.apple.com/home/for-you";
// A fresh account unlocks its way up in stages, so the whole-site walk gets more
// passes than the Academy one, and every module gets a few attempts before the
// run gives up on it.
const SITE_MAX_PASSES = 12;
// Enough attempts for a four-option question to be worked through one wrong
// answer at a time, now that each attempt guesses around what the last one had
// rejected.
const MAX_MODULE_ATTEMPTS = 5;

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
// Sales Coach puts its tabs in a plain sidebar, not in a <nav>, so a scoped
// search finds nothing. What actually marks a tab is its URL: a single word
// under /home/ with no id in it, unlike /home/collection/241204.
async function readNavLinks(targetPage) {
  return targetPage.evaluate(() => {
    const tidy = (value = "") => String(value).replace(/\s+/g, " ").trim();
    const found = new Map();

    for (const anchor of document.querySelectorAll("a[href]")) {
      if (!anchor.href.startsWith(location.origin)) continue;
      const url = anchor.href.split("#")[0];
      let path;
      try {
        path = new URL(url).pathname.replace(/\/$/, "");
      } catch {
        continue;
      }
      if (!/^\/home\/[a-z][a-z0-9-]*$/i.test(path)) continue;
      const title = tidy(anchor.innerText) || tidy(anchor.getAttribute("aria-label")) || path;
      if (!found.has(url)) found.set(url, title);
    }

    return [...found].map(([url, title]) => ({ url, title }));
  }).catch(() => []);
}

function hubTitle(link) {
  // These links are labelled "See All" on the page they sit on, which says
  // nothing in a log. The path does.
  if (!link.title || /^(see|show|view)\s+all$/i.test(link.title.trim())) {
    return hubPath(link.url).replace("/home/", "").replace(/-/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }
  return link.title;
}

// The sidebar is rendered a second or two after the page's own content, so a
// read taken straight after the navigation finds only the tab already on
// screen — which is why a whole-site run used to report a single tab to walk.
async function readNavLinksSettled(targetPage, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let best = [];
  let steadySince = null;

  while (Date.now() < deadline) {
    const links = await readNavLinks(targetPage);
    if (links.length > best.length) {
      best = links;
      steadySince = Date.now();
    } else if (best.length && steadySince && Date.now() - steadySince >= 2000) {
      break;
    }
    await targetPage.waitForTimeout(500);
  }

  return best;
}

export async function readNavHubs(targetPage) {
  const links = await readNavLinks(targetPage);
  return links
    .filter((link) => !SITE_HUB_SKIP.test(hubPath(link.url)))
    .map((link) => ({ ...link, title: hubTitle(link) }));
}

// XP is the number the account is judged on, so a run reports what it moved.
// It is read off whatever the page shows rather than from a known element:
// nothing in the player exposes it, and the wording differs by locale.
// The profile header reads "Level 40 \u2022 11,225 XP", so the level-and-total
// form is tried first: it is the only one on the site that is certainly the
// account's own total. The looser forms below it match a bare "11,225 XP" on
// builds that omit the level, and are only reached on a page that has no
// level line at all.
const XP_PATTERNS = [
  /(?:level|רמה)\s*\d+\s*[^\d]{0,4}\s*([\d][\d.,]*)\s*(?:xp|points|נקודות)\b/i,
  /([\d][\d.,]*)\s*(?:xp|points|נקודות)\b/i,
  /\b(?:xp|points?|נקודות)\s*[:\-]\s*([\d][\d.,]*)/i
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

// Where this account shows its total, once it has been found. Every later read
// goes straight there instead of hunting again.
const PROFILE_URLS = ["https://salescoach.apple.com/home/profile", "https://salescoach.apple.com/home/achievements"];

// The total read without disturbing the walk. The listing page a run is in the
// middle of must not be navigated away from — doing that costs a reload of the
// section and, on a slow build, loses the walk's place — so the profile is
// opened in a tab of its own and closed again.
async function readXpAside(xpPages = []) {
  const current = session();
  if (!current.context) return null;
  const candidates = [...new Set([...xpPages, ...PROFILE_URLS])];
  let aside = null;
  try {
    aside = await current.context.newPage();
    for (const url of candidates) {
      try {
        await aside.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
        if (looksSignedOut(aside.url())) return null;
        await aside.waitForTimeout(2500);
        const value = await readXpFrom(aside);
        if (value !== null) return value;
      } catch {
        // Try the next candidate page.
      }
    }
    return null;
  } finally {
    if (aside && !aside.isClosed()) await aside.close().catch(() => {});
  }
}

// The total is read wherever this account happens to show it: the page in front
// of us first, then Achievements and Profile.
async function readXp(listPage, xpPages = []) {
  // The account's own page first: a listing page can carry an "XP" label of its
  // own on a card, and reading that as the account total is worse than reading
  // nothing. Only if no profile page answers is the page in front of us used.
  const aside = await readXpAside(xpPages);
  if (aside !== null) return aside;

  const here = await readXpFrom(listPage);
  if (here !== null) return here;

  const back = listPage.url();
  for (const url of xpPages) {
    try {
      await openListing(listPage, url);
      const value = await readXpFrom(listPage);
      if (value !== null) {
        await openListing(listPage, back).catch(() => {});
        return value;
      }
    } catch {
      // A page that will not open simply has no total to give.
    }
  }
  if (xpPages.length) await openListing(listPage, back).catch(() => {});
  return null;
}

async function collectHubs(listPage) {
  const home = siteHome(listPage);
  await openListing(listPage, home);

  const links = await readNavLinksSettled(listPage);
  // For You is always walked, whether or not the sidebar names it.
  const hubs = new Map([[hubPath(home), { url: home, title: "For You" }]]);
  for (const link of links) {
    const path = hubPath(link.url);
    if (SITE_HUB_SKIP.test(path)) continue;
    if (!hubs.has(path)) hubs.set(path, { ...link, title: hubTitle(link) });
  }
  // The account's own pages are not walked, but they are where an XP total is
  // shown, so their URLs are kept.
  const xpPages = links.filter((link) => XP_PAGE_HINTS.test(hubPath(link.url))).map((link) => link.url);
  return { hubs: [...hubs.values()], xpPages };
}

// Some rails render each card as a React div: no anchor, no role, no tabindex,
// so nothing in the DOM says it is a link. On the live For You page that is
// exactly what the "Up Next" cards are. When a listing looks empty for that
// reason, each card-shaped row is clicked once to find out where it leads.
async function findCardTargets(listPage, hubUrl, max = 20) {
  const selector = ".entity, [role='listitem'], [class*='card' i]";
  const found = new Map();
  const total = Math.min(await listPage.locator(selector).count().catch(() => 0), max);
  if (!total) return [];

  log(`Nothing on this page links anywhere; clicking through ${total} card-shaped row(s) to find out where they go.`);
  for (let index = 0; index < total; index++) {
    const row = listPage.locator(selector).nth(index);
    if (!(await row.isVisible().catch(() => false))) continue;
    if (await row.locator("a[href]").count().catch(() => 0)) continue;
    const title = clean(await row.innerText().catch(() => "")).slice(0, 120);
    if (!title) continue;

    const before = listPage.url();
    await row.click({ force: true, timeout: 5000 }).catch(() => {});
    await listPage.waitForTimeout(1500);
    const after = listPage.url().split("#")[0];

    if (after !== before) {
      if (/\/home\//.test(after) && !found.has(after)) {
        const module = after.match(/\/home\/content\/view\/(\d+)/);
        found.set(after, module
          ? { kind: "module", id: `module:${module[1]}`, url: after, title, completed: false, locked: false }
          : { kind: "container", id: containerId(after), url: after, title, completed: false, locked: false });
      }
      await openListing(listPage, hubUrl).catch(() => {});
    }
  }
  log(`Found ${found.size} destination(s) behind the cards.`);
  return [...found.values()];
}

// Apple Professional Academy is where nearly all of an account's work lives,
// and it is reached from the For You tab. Its card is classified as a section
// on most builds but not on all of them, so on For You it is also looked up by
// name, and either way it is put at the front: everything else on that tab is a
// shortcut into it.
async function withAcademy(listPage, hub, nodes) {
  if (!/\/home\/for-you$/i.test(hubPath(hub.url))) return nodes;

  const link = await findLinkMatching(listPage, ACADEMY_NAMES);
  if (!link) {
    log("Apple Professional Academy is not linked from For You on this account.");
    return nodes;
  }

  const listed = nodes.find((node) => hubPath(node.url) === hubPath(link.url));
  if (listed) {
    log(`Walking Apple Professional Academy first: ${listed.url}`);
    return [listed, ...nodes.filter((node) => node !== listed)];
  }

  log(`Apple Professional Academy was not listed as a section; opening it from its own link: ${link.url}`);
  return [{
    kind: "container",
    id: containerId(link.url),
    url: link.url,
    title: "Apple Professional Academy",
    completed: false,
    locked: false
  }, ...nodes];
}

// One hub page: everything listed on it is a root to walk into, and anything
// that is already a module is run right there.
async function walkHub(listPage, hub, state) {
  log(`Hub "${hub.title}": opening ${hub.url}`);
  let nodes;
  try {
    nodes = await loadListingItems(listPage, hub.url);
  } catch (error) {
    if (error?.signedOut) throw error;
    log(`Could not open "${hub.title}": ${error instanceof Error ? error.message : String(error)}`);
    return;
  }
  session().page = listPage;

  if (!nodes.length) nodes = await findCardTargets(listPage, hub.url);
  nodes = await withAcademy(listPage, hub, nodes);

  const containers = nodes.filter((node) => node.kind === "container");
  const modules = nodes.filter((node) => node.kind === "module");
  log(`Hub "${hub.title}": ${containers.length} section(s) and ${modules.length} module(s) listed.`);
  if (!nodes.length) {
    log(`Hub "${hub.title}" has nothing on it to walk.`);
    return;
  }

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

  // Unfinished sections first: a run that is cut short, or that is watched for
  // ten minutes to see whether it is doing anything, should be inside the work
  // that is still missing rather than the work the site already counts as done.
  for (const container of workFirst(containers)) {
    if (limitReached(state)) {
      noteContainer(state, container, hub.title, "limit-reached");
      return;
    }
    if (state.visitedContainers.has(container.id)) continue;
    if (container.locked) {
      state.deferred.set(container.id, { ...container, chapter: hub.title });
      noteContainer(state, container, hub.title, "locked");
      log(`Locked for now: "${container.title}".`);
      continue;
    }
    if (state.exhaustedContainers.has(container.id)) {
      noteContainer(state, container, hub.title, "already-finished");
      continue;
    }
    if (container.completed) log(`"${container.title}" reads as completed; looking inside anyway.`);
    noteContainer(state, container, hub.title, "walked");
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
  const state = createRunState({ onProgress, skipCompleted, limit, mode, submitUnverified, blind, targetXp });

  log("Whole-site run: walking every tab this account can reach, not just the Academy.");
  const memory = answerMemoryStats();
  if (memory.confirmed || memory.narrowed) {
    log(`Starting from ${memory.confirmed} answer(s) earlier runs confirmed and ${memory.narrowed} question(s) they narrowed down.`);
  }
  if (blind && mode !== "capture") {
    log("Blind mode: a quiz with no stored answers is still answered and submitted, and its grade is reported back as an answer key.");
  }
  if (mode === "capture") log("Capture mode: quizzes are read, never answered or submitted.");
  if (limit > 0) log(`Stopping after ${limit} module(s).`);

  const { hubs, xpPages } = await collectHubs(listPage);
  state.xpPages = xpPages;
  log(`Found ${hubs.length} tab(s) to walk: ${hubs.map((hub) => hub.title).join(", ")}.`);

  const xpBefore = await readXp(listPage, xpPages);
  if (xpBefore === null) {
    log("No XP total is shown on this account's pages; the run will report progress by module instead.");
  } else {
    log(`XP before this run: ${xpBefore.toLocaleString()}${targetXp ? ` (target ${targetXp.toLocaleString()})` : ""}.`);
  }
  let xpAfter = xpBefore;

  for (let pass = 1; pass <= SITE_MAX_PASSES; pass++) {
    const processedBefore = state.modulesProcessed;
    const learnedBefore = state.answersLearned;
    state.pass = pass;
    state.visitedContainers = new Set();
    state.deferred = new Map();
    state.deferredCompleted = new Set();
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

    let signedOut = false;
    for (const hub of hubs) {
      if (limitReached(state)) break;
      try {
        await walkHub(listPage, hub, state);
      } catch (error) {
        if (!error?.signedOut) throw error;
        log(error.message);
        signedOut = true;
        break;
      }
    }
    if (signedOut) {
      log("Stopping this run: nothing can be completed while the account is signed out. Everything learned so far has been kept.");
      break;
    }

    const gained = state.modulesProcessed - processedBefore;
    const settled = state.answersLearned - learnedBefore;
    if (state.exhaustedContainers.size) {
      log(`${state.exhaustedContainers.size} section(s) have nothing left in them; a later pass will not open them again.`);
    }
    // Sections passed over because they read as completed are work this run has
    // not done yet, so they hold the run open for another pass the same way a
    // locked row does. Without this a first pass that found nothing outstanding
    // would stop before ever looking inside them.
    const stillShut = state.deferred.size + state.blocked + state.deferredCompleted.size;
    if (state.deferredCompleted.size) {
      log(`${state.deferredCompleted.size} section(s) that read as completed were left for the next pass.`);
    }
    const toRetry = [...state.retryable.keys()].filter((id) =>
      (state.attempts.get(id) || 0) < MAX_MODULE_ATTEMPTS).length;

    xpAfter = await readXp(listPage, xpPages);
    if (xpAfter !== null) {
      const moved = xpBefore === null ? null : xpAfter - xpBefore;
      log(`XP after pass ${pass}: ${xpAfter.toLocaleString()}${moved === null ? "" : ` (${moved >= 0 ? "+" : ""}${moved.toLocaleString()})`}.`);
    }

    if (state.targetReached) {
      log(`Target of ${targetXp.toLocaleString()} XP reached mid-walk; stopping.`);
      break;
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
    // A first pass that deliberately skipped every finished section has more to
    // do even if it completed nothing, so it is not "a pass that moved nothing".
    if (!gained && !settled && !state.deferredCompleted.size) {
      log(`${stillShut} locked and ${toRetry} unpassed item(s) remain, and this pass moved nothing; stopping.`);
      break;
    }
    if (pass === SITE_MAX_PASSES) log("Reached the maximum number of passes.");
  }

  await openListing(listPage, siteHome(listPage)).catch(() => {});
  session().page = listPage;
  if (xpAfter === null) xpAfter = await readXp(listPage, xpPages);

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

  const lockedRows = [];
  for (const frame of targetPage.frames()) {
    const rows = await frame.evaluate(() => {
      const tidy = (value = "") => String(value).replace(/\s+/g, " ").trim();
      const LOCK = /(^|[^a-z])lock(ed)?([^a-z]|$)/i;
      const found = new Set();
      const result = [];
      for (const element of document.querySelectorAll("[class], [aria-label], [data-testid]")) {
        const marks = [element.className, element.getAttribute("aria-label"), element.getAttribute("data-testid")]
          .filter(Boolean).join(" ");
        if (!LOCK.test(marks)) continue;
        const row = element.closest(".entity, [role='listitem'], li, [class*='row' i], [class*='card' i]") || element.parentElement;
        if (!row || row.querySelector("a[href]") || found.has(row)) continue;
        const rect = row.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) continue;
        found.add(row);
        result.push({ text: tidy(row.innerText).slice(0, 500), className: tidy(row.className).slice(0, 300), marks: tidy(marks).slice(0, 300) });
      }
      return result;
    }).catch(() => []);
    lockedRows.push(...rows);
  }

  return {
    url: targetPage.url(),
    title: await targetPage.title().catch(() => ""),
    progress: await readChapterProgress(targetPage),
    player: await moduleAssessmentState(targetPage),
    lockedRowsWithoutLinks: await countLockedRows(targetPage),
    lockedRows,
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
    const responses = [];
    try {
      for (const element of document.querySelectorAll("[assessmentId]")) {
        const id = element.getAttribute("assessmentId");
        const assessment = SeedInterface.QSP.getAssessmentWithID?.(id);
        if (assessment) {
          assessments.push({ id, keys: Object.keys(assessment).slice(0, 60) });
          const stored = SeedInterface.QSP.assessments?.[id] || assessment;
          const attempts = Array.isArray(stored.submittedResponse) ? stored.submittedResponse : [];
          responses.push(...attempts.slice(-2).map((attempt) => ({
            id,
            questions: (attempt?.questionObjects || []).map((question) => safe(question))
          })));
        }
      }
    } catch {}

    return {
      available: true,
      completionScore: Number.isFinite(SeedInterface.QSP.completionScore) ? SeedInterface.QSP.completionScore : null,
      assessments,
      responses,
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
