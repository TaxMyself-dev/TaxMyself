# Kipi: approved opening and glossary

Approved for implementation on 2026-09-18. This extends KT-021 only.

## Locked designs

- Opening: source image `exec-0eec934f-4999-4378-bad5-cfca0df5c5b4.png`,
  copied unchanged to `frontend/src/assets/self-employed-guide/cover-kipi-approved.png`.
  Kipi has no backpack, stands on the square logo icon and points to the headline.
  The softer headline is raised, its gaps reduced and "גם" horizontally centered.
- Slide 2: source image `exec-c40316ab-cb5c-4392-ab42-44f108c6dfa5.png`,
  copied unchanged to `frontend/src/assets/self-employed-guide/basic-concepts-kipi-approved.png`.
  Large Kipi with prominent mint backpack; five vertically stacked colorful rows.
  Title: "כמה מושגים בסיסיים לפני שיוצאים לדרך".
  Terms: הכנסות / מחזור, הוצאות מוכרות, רווח, הכנסה חייבת,
  משכורת (שכר ברוטו). Keep "מקזזים", "לקזז" and "מיסים".
  No net-income row or bottom explanatory banner.
- Generated source directory: `C:/Users/harel/.codex/generated_images/01a08785-cca4-74b2-9059-1b7aae1008bc`.

## Implementation boundaries

Both use the existing approved-artwork renderer with contain (never cropped),
and descriptive Hebrew alt text. Do not reconstruct the approved composition
using approximate HTML or leave the old cover overlay above the new artwork.
Guide now has 20 screens. Existing chapter navigation uses stable slide IDs.
The glossary insertion shifts subsequent screens by one without changing them.
The six-benefit deductions/credits preview is not part of this implementation.
No calculator logic, annual parameters, backend, auth or production changes.

## Verification

- SHA256 of both copied assets matches the approved generated originals.
- Focused Angular guide/calculator suite: 23 passed, exit 0.
- Angular production build: passed, exit 0, hash b167153114b38831 (72.447s).
- Local browser review: all 20 slides decode; approved images at positions 1/2;
  next/previous, VAT hotspot at screen 16, contain sizing, fullscreen and compact
  viewport passed with no page errors.
- Temporary local preview bootstrap and QA screenshots/scripts are not committed.
- Worktree-local implementation; no push, integration or deployment.
