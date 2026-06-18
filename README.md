# US Expat Tax Filer · Israel (TY2025)

A **local-first** web app that helps US expats in Israel prepare tax data. It
ingests Israeli financial documents in ILS, converts to USD using rates you
supply, and generates export files for downstream filing. **No data ever leaves
your browser** — parsing, OCR, and file generation all run client-side.

## Stack

React 18 + Vite + TypeScript · Tailwind CSS · Zustand (localStorage-persisted) ·
pdfjs-dist (PDF text) · tesseract.js (OCR fallback) · yaml · react-dropzone.

## Run (local Node)

```bash
npm install
npm run dev      # start dev server
npm run build    # typecheck + production build
npm run preview  # preview the production build
```

## Run with Docker (Mac)

The app is fully client-side, so the image is just a static build served by
nginx.

```bash
docker compose up --build      # then open http://localhost:8080
```

Or without compose:

```bash
docker build -t us-expat-tax-filer .
docker run --rm -p 8080:80 us-expat-tax-filer
```

Note: on first use of OCR, tesseract.js fetches its WASM engine and the
Hebrew/English language data from a public CDN, so the browser needs internet
access that one time. Your **document contents never leave the browser** — only
the generic OCR model is downloaded.

## Wizard flow

1. **Setup & Profile** — taxpayer info, tax year, average + EOY USD/ILS rates. SSN is masked.
2. **Documents (Router + extractors)** — drop any Israeli tax PDF/image. A
   client-side **Document Router** (`src/services/DocumentExtractionService.ts`)
   extracts the text (pdf.js text layer first; automatic canvas-render + OCR
   fallback for HILAN-generated forms whose embedded fonts have no Unicode
   mapping), classifies the document, and routes it to a type-specific
   extractor:

   - **Form 106** (salary/withholding) → gross income (codes `172/158`) and tax
     withheld (codes `042/048`). Verified end-to-end on a real HILAN 106
     (₪166,189 gross / ₪13,244 tax).
   - **Form 867** (bank/broker) → interest (`ריבית זכות`), dividends
     (`דיבידנד`), and net capital gains (`רווח לצרכי מס` − `הפסד מועבר`).
   - **Bank/Pension balance** (FBAR) → account identifier + end-of-year/max
     balance (`יתרה לסוף שנה` / `יתרת זכות`).

   Each detection opens a **confirmation modal** showing the document type and
   editable values with a live USD preview; on confirm, values dispatch to the
   Zustand store (income → Step 2, interest/dividends/gains → Step 3, balances →
   Step 4). Hebrew matching is orientation-agnostic to handle reversed RTL text.
3. **Passive Income** — manual entry for interest, capital gains, dividends.
4. **FBAR** — CRUD table of foreign accounts with live USD conversion (EOY rate) and a sticky banner that flips to "FBAR Filing Required" once aggregate balances exceed $10,000.
5. **Export Hub** — review dashboard, Form 2555/1116 toggle, and one-click downloads of `config.yaml` (for `irs-form-filler`) and `fbar_2025.csv`.

## Notes

- Default exchange rates are placeholders — confirm official figures before filing.
- This tool prepares data; it is not tax advice. Verify all values against source documents.
# israel-us-tax-filling
