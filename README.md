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

## How to use

1. Click **Connect tab**.
2. In the connected Chromium tab, log into the Apple training site.
3. Navigate to the exam page in that same tab. The URL can change; the runner keeps following it.
4. Return to the local UI.
5. Choose the current exam.
6. Optional: enable **Dry run** first.
7. Click **Fill exam**.
8. Review the filled answers manually.
9. Submit manually when ready.

## Adding more exams

Edit `exams.js` and add another object under `exams`.

Each question supports:

- `single` — radio buttons
- `multiple` — checkboxes
- `selects` — dropdowns

The runner matches every question by normalized partial visible text, not by question number or array position. The exam may render its questions in any order.

## Important

The exact Apple training DOM may vary. If a question fails, inspect that question's HTML and adjust the selectors in `runner.js`.
