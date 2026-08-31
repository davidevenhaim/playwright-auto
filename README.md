# Apple Exam Runner

Local UI + Playwright automation.

## Requirements

- Node.js 18+ (Node 20+ recommended)

## Install

```bash
npm install
npx playwright install chromium
```

## Run

```bash
npm start
```

Then open:

http://localhost:3030

## Running several accounts at once

The **Browser session** picker at the top of the UI decides which browser a
click drives. Each session gets:

- its own Chromium window and its own profile directory
  (`apple-playwright-profile` for session 1, `apple-playwright-profile-<id>`
  for the rest), so every session is a separate login
- its own status line and its own log
- its own result files: session 1 writes the usual names, any other session
  tags its own (`exam-results-<time>-s2.json`, `captured-exams-s2.json`, …),
  so two runs never overwrite each other

To work two accounts in parallel: pick session 1, click **Connect tab**, log in
account A there and start a run; then open a second browser tab on
http://localhost:3030?session=2, click **Connect tab** in it, log in account B
in the new window, and start its run. The two runs are independent — the
selected session is remembered per browser tab. **New session** adds more.

## How to use

1. Pick a **Browser session** (session 1 is the original profile).
2. Click **Connect tab**.
3. In the connected Chromium window, log into the Apple training site.
4. Navigate to the exam page in that same tab. The URL can change; the runner keeps following it.
5. Return to the local UI.
6. Choose the current exam.
7. Optional: enable **Dry run** first.
8. Click **Fill exam**.
9. Review the filled answers manually.
10. Submit manually when ready.

## Apple Professional Academy

Leave the connected tab anywhere in Sales Coach and click **Complete Apple
Professional Academy**.

The Academy is a tree, and the runner walks all of it:

```
Apple Professional Academy      "4/7 completed"      chapters
  └─ Chapter                    "1 completed, 3 required"    collections
       └─ Collection            modules
            └─ Module           the SEED player: a quiz, or reading material
```

Only a module has a `/home/content/view/<id>` URL. Everything above it is a
listing page the runner has to open in turn, which is why an earlier version
that collected module links alone found one item on the Academy page and
stopped.

For each chapter and collection it reaches, the runner:

- skips anything the site already marks completed
- opens each pending module in its own tab, plays its videos, then either
  fills and submits its quiz or scrolls the reading material past the 70% the
  player needs to record it
- records the chapter each result came from, and flushes the results file after
  every module

A chapter that is locked is left alone. Once the run finishes something, the
tree is walked again so that whatever those completions unlocked is picked up;
this repeats until a pass opens nothing new.

### Exams with no stored answers

Leave **Answer unknown quizzes blind** on (it is on by default). A quiz that
does not match anything in `exams.js` is answered anyway — the first option, or
the first N where the question says "Select two" — and submitted. The site then
grades it, and grading is the answer key:

- a question the server marks **correct** is settled: whatever was selected in
  it is right
- a question it marks **incorrect** is not guessed at again; the run records
  what was rejected and which options are still in play

Both land in `exams-learned-<timestamp>.js`, written as entries ready to move
into `exams.js`. Settled questions are live code; unsolved ones are commented
out with their remaining options:

```js
{ type: "single", match: "Which zorbulon protocol governs widget handoff", answer: "The Meridian handoff protocol" },
// NOT SOLVED. The server rejected: 2 millimetres
// Remaining options: 8 millimetres | 14 millimetres
// { type: "single", match: "What is the maximum permitted flange tolerance", answer: "" },
```

Move the settled entries into `exams.js` and the next run passes those
questions outright. Run again to clear the rest: each attempt rules out what it
already tried, so a quiz converges in a few passes and then stays solved for
every user afterwards.

A first blind attempt usually scores below the pass threshold. That is expected
— it buys the answer key.

### Capturing without answering

**Capture every Academy quiz** walks the same tree but reads only: it answers
nothing, submits nothing, and does not scroll reading material far enough to
complete it, so it can be pointed at an account whose progress must not move. It
writes the raw questions to `academy-captures-<timestamp>.json` and a skeleton
to `exams-draft-<timestamp>.js` with every answer left blank.

### Answers that are only a guess

A question in `exams.js` can carry `unverified: true`. Those are filled like any
other but the quiz is **not** submitted, because on a short quiz one wrong answer
fails the whole attempt. Tick **Also submit stored answers that are only a best
guess** to spend an attempt on them anyway, or answer that one question by hand
once and remove the flag.

### When a row is skipped

Click **Scan page structure**. It prints what the collector sees on the
connected tab: every link on the page, how each one was classified (module,
chapter, or ignored), the evidence used, and any locked rows that carry no
link at all. That output is what to check first when the walk misses
something.

## Adding more exams

Edit `exams.js` and add another object under `exams`.

Each question supports:

- `single` — radio buttons
- `multiple` — checkboxes
- `selects` — dropdowns

The runner matches every question by normalized partial visible text, not by question number or array position. The exam may render its questions in any order.

## Important

The exact Apple training DOM may vary. If a question fails, inspect that
question's HTML and adjust the selectors in `runner.js`. If a chapter or
collection is skipped, start from **Scan page structure**: the `nodes` and
`links` it prints show which link was missed and why it was not treated as a
chapter.
