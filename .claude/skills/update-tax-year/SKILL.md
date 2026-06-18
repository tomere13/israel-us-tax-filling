---
name: update-tax-year
description: Update this app for a new IRS tax year — fetch the new 2025-style blank PDFs, derive field maps, refresh brackets/standard-deduction/FEIE/CTC and exchange rates, wire the year in, and verify. Use when the user says "update for 2026/2027", "new tax year", "add next year", "refresh tax data", or it's a new filing season.
---

# Update for a new tax year

Yearly runbook. Replace `<Y>` with the target tax year (the year being filed *for*, e.g.
2026 — filed in 2027). The app's default tax year is already dynamic (`currentYear - 1` in
`src/store/useStore.ts`), so the UI auto-points at `<Y>` once the data below exists.

Background: why this is hand-done each year is in the memory `feature-pdf-generation` — IRS
restructures forms yearly with no stable field IDs/tooltips, so field maps can't auto-update.
Keep the surface tiny (only the boxes we fill) and let the `demo()` round-trip catch mistakes.

## 1. Fetch the genuine `<Y>` blank PDFs

```bash
mkdir -p public/forms/<Y>
for f in f1040 f1116 f2555; do
  curl -sL -o public/forms/<Y>/$f.pdf "https://www.irs.gov/pub/irs-prior/$f--<Y>.pdf"
done
# Confirm they really are tax year <Y> (header must read "...Dec. 31, <Y>"):
for f in f1040 f1116 f2555; do
  python3 -c "import pypdf;print('$f', [l for l in pypdf.PdfReader('public/forms/<Y>/$f.pdf').pages[0].extract_text().splitlines() if 'For the year' in l or 'Form' in l][:1])"
done
```
If the IRS hasn't posted the final `<Y>` form yet (early in the season), stop and tell the
user — don't substitute a draft or prior-year PDF.

## 2. Derive field maps → `src/utils/formFields<Y>.ts`

The IRS renumbers fields between years, so re-derive — don't copy last year's tokens blindly.

```bash
python3 .claude/skills/update-tax-year/derive-fields.py public/forms/<Y>/f1040.pdf
python3 .claude/skills/update-tax-year/derive-fields.py public/forms/<Y>/f1116.pdf
python3 .claude/skills/update-tax-year/derive-fields.py public/forms/<Y>/f2555.pdf --checkboxes
```

Copy `src/utils/formFields2025.ts` to `formFields<Y>.ts` and update each token by matching
the printed **line label** in the script output (not position — positions shift). Keep the
same semantic keys; only the `f1_NN[0]` tokens change. Notes:
- The script flags terminal-token **duplicates** — those must be referenced by FULL name
  (as `FILING_STATUS_<Y>_FIELD` already does for the filing-status checkboxes). Run with
  `--checkboxes` and read the `full:` lines to map each filing status → its checkbox.
- Confirm the 1040 money lines we fill: 1a/1z wages, 9 total income, 11 AGI, 12 std
  deduction, 15 taxable, 16 tax, 20 (Sch 3 / FTC), 22, 24 total tax, 34 refund, 37 owe.

## 3. Refresh tax constants → `src/utils/taxData.ts`

Add a `<Y>` block to `YEARS` and a `<Y>` row to `RATES`. Sources:
- **Brackets + standard deduction**: IRS Rev. Proc. for `<Y>` (search "IRS Rev Proc <Y>
  inflation adjustments" / Tax Foundation "<Y> tax brackets"). Add `SINGLE_<Y>`, `MFJ_<Y>`,
  `MFS_<Y>`, `HOH_<Y>` bracket arrays like the 2025 ones.
- **FEIE limit** (Form 2555 max): IRS Rev. Proc. (`$130,000` for 2025, `$132,900` for 2026).
- **CTC**: `ctcPerChild` / `ctcRefundableMax` (watch for law changes — OBBBA changed these).
- **Exchange rates**: `avg` = IRS yearly-average ILS/USD table; `eoy` = Treasury Dec-31 rate
  (for FBAR). Both stay editable in the UI, but prefill the official numbers. Mark `eoy` as an
  estimate in a comment if the year-end rate isn't published yet.

Do **not** guess these — pull the official figures. NIIT thresholds in `estimate.ts` are
fixed by statute; leave them unless Congress changes §1411.

## 4. Wire `<Y>` into the filler → `src/utils/fillForms.ts`

Currently hard-keyed to 2025. Make it select by `s.taxYear`:
- Import the new map: `import { F1040 as F1040_<Y>, ... } from "./formFields<Y>";`
- Add a small registry, e.g. `const MAPS = { 2025: {...}, <Y>: { F1040: F1040_<Y>, F1116: ..., F2555: ..., FILING: FILING_STATUS_<Y>_FIELD } }` and pick `MAPS[s.taxYear] ?? MAPS[latest]`.
- `fetchBlank` already takes a `year` arg — pass `s.taxYear` and ensure `public/forms/<Y>/` exists.
- Update the `demo()` sample to also fill the `<Y>` blanks and assert no missing tokens.

## 5. Verify (must all pass)

```bash
npm install                         # if pdf-lib/deps not present
npx tsx src/utils/fillForms.ts      # round-trip: every token resolves + filing box checked
npx tsx src/utils/estimate.ts       # NIIT / FEIE / FTC / CTC self-checks
npx tsx src/utils/forms.ts          # required-forms thresholds
npx tsc --noEmit                    # typecheck (catches missing i18n keys + map typos)
npm run build                       # confirms public/forms/<Y>/*.pdf land in dist
```

Then a human spot-check: generate a `<Y>` 1040 from a realistic profile and open it — header
reads "…Dec. 31, `<Y>`", wages on line 1z, total tax on line 24, the right filing-status box
checked, foreign form (1116 or 2555) populated.

## 6. i18n + housekeeping

- If any new UI string was added, add the key to **all four** locales (`src/i18n/{en,he,ru,ar}.ts`)
  — the `typeof en` type makes tsc fail otherwise.
- Bump any year mentioned in copy (e.g. `generateTitle` "(2025)").
- The generated PDFs stay **review-grade drafts** (FEIE stacking worksheet, AMT, PFIC, and
  capital-gains detail are not modeled) — keep that caveat in the UI.
