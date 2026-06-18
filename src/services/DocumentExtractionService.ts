// Local-First Document Extraction Engine.
//
// A "Document Router" that (1) extracts text from an Israeli tax PDF entirely
// client-side via pdf.js (with an OCR fallback for documents whose embedded
// fonts have no Unicode mapping), (2) classifies the document type, and
// (3) routes the raw text to a type-specific regex extractor. No data ever
// leaves the browser.

import { extractPdfText, extractImageText } from "../utils/form106";
import {
  findByCodes,
  hasPhrase,
  hasWords,
  hasAnyPhrase,
  normalizeText,
  reverseStr,
  valueNearKeyword,
  sumByFieldCodes,
  moneyTokens,
} from "../utils/parse";

export enum DocumentType {
  FORM_106 = "FORM_106", // Salary & withholding (employer annual statement)
  FORM_867 = "FORM_867", // Bank/broker annual statement (interest, dividends, capital gains)
  BANK_FBAR = "BANK_FBAR", // Account/pension balance confirmation (for FBAR)
  UNKNOWN = "UNKNOWN",
}

export const DOCUMENT_LABELS: Record<DocumentType, string> = {
  [DocumentType.FORM_106]: "Form 106 — Salary & Withholding",
  [DocumentType.FORM_867]: "Form 867 — Interest, Dividends & Capital Gains",
  [DocumentType.BANK_FBAR]: "Bank / Pension Balance (FBAR)",
  [DocumentType.UNKNOWN]: "Unknown document",
};

// ---- Structured extractor outputs -----------------------------------------

export interface Form106Data {
  grossIncomeILS: number;
  taxWithheldILS: number;
}

export interface Form867Data {
  ordinaryDividendsILS: number;
  interestILS: number;
  netCapitalGainsILS: number;
  taxWithheldILS: number;
}

export interface FbarData {
  bankName: string;
  accountNumber: string;
  maxBalanceILS: number;
  isJoint: boolean;
}

export type ExtractedData = Form106Data | Form867Data | FbarData | null;

export interface ExtractionResult {
  type: DocumentType;
  label: string;
  data: ExtractedData;
  rawText: string;
}

// ---- Task 1: PDF text + classification ------------------------------------

/** Extract text from a PDF (text layer first, OCR fallback). */
export async function extractTextFromPDF(
  file: File,
  onProgress?: (pct: number) => void
): Promise<string> {
  return extractPdfText(file, onProgress);
}

/** Extract text from any supported file (PDF or image). */
export async function extractText(
  file: File,
  onProgress?: (pct: number) => void
): Promise<string> {
  const isPdf =
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  return isPdf
    ? extractTextFromPDF(file, onProgress)
    : extractImageText(file, onProgress);
}

/**
 * Identify the document type from its raw text. Hebrew keyword checks are
 * orientation-agnostic (handle reversed RTL output).
 */
export function classifyDocument(rawText: string): DocumentType {
  const t = normalizeText(rawText);

  // Word-based (not phrase-based): the PDF text layer reverses RTL word order,
  // so "אישור ניכוי מס" arrives as "מס ניכוי אישור". Match individual words.
  if (t.includes("106") && (hasWords(t, ["פרטי", "המעביד"]) || hasPhrase(t, "משכורת"))) {
    return DocumentType.FORM_106;
  }
  // Form 867 (ניכוי מס במקור מריבית/דיבידנד/רווחים): the form number plus any of
  // its hallmark words — deduction / interest / gains.
  if (
    t.includes("867") &&
    (hasPhrase(t, "ניכוי") || hasPhrase(t, "ריבית") || hasPhrase(t, "רווחי"))
  ) {
    return DocumentType.FORM_867;
  }
  // Bank account statement (דף חשבון) or pension/balance confirmation.
  if (
    hasWords(t, ["אישור", "יתרות"]) ||
    hasWords(t, ["דוח", "שנתי", "לעמית"]) ||
    hasWords(t, ["דף", "חשבון"]) ||
    (hasWords(t, ["יתרה", "מצטברת"]) &&
      hasWords(t, ["מספר", "חשבון"]) &&
      hasAnyPhrase(t, ["חובה", "זכות"]))
  ) {
    return DocumentType.BANK_FBAR;
  }
  return DocumentType.UNKNOWN;
}

// ---- Task 2: Extractors ----------------------------------------------------

const GROSS_CODES = ["158", "172"];
const TAX_CODES = ["042", "048"];

/** A. Form 106 — gross salary and income tax withheld. */
export function Form106Extractor(rawText: string): Form106Data {
  const gross = findByCodes(rawText, GROSS_CODES);
  const tax = findByCodes(rawText, TAX_CODES);
  return {
    grossIncomeILS: gross.value,
    taxWithheldILS: tax.value,
  };
}

// Form 867 interest certificate: taxable interest is split across per-rate
// buckets, and the total tax withheld sits in field 043 (טופס 1301 codes).
const INTEREST_CODES = ["076", "078", "126", "142", "053"];
const F867_TAX_CODES = ["043"];

/** B. Form 867 — interest, dividends, net capital gains, tax withheld. */
export function Form867Extractor(rawText: string): Form867Data {
  // Interest: sum the per-rate field-code buckets; fall back to keyword
  // matching for older/other 867 layouts that don't print field codes.
  const interestByCodes = sumByFieldCodes(rawText, INTEREST_CODES);
  const interestILS =
    interestByCodes > 0
      ? interestByCodes
      : valueNearKeyword(rawText, ["ריבית זכות", "ריבית"]);

  const ordinaryDividendsILS = valueNearKeyword(rawText, ["דיבידנד"]);
  // Prefer the taxable gain; fall back to proceeds, then subtract carried loss.
  const taxableGain = valueNearKeyword(rawText, [
    "רווח לצרכי מס",
    "רווח הון",
  ]);
  const proceeds = valueNearKeyword(rawText, ["תמורה ממכירת ניירות ערך"]);
  const carriedLoss = valueNearKeyword(rawText, ["הפסד מועבר", "הפסד"]);
  const grossGain = taxableGain || proceeds;

  // Tax withheld at source (field 043) — feeds the Foreign Tax Credit.
  const taxWithheldILS = sumByFieldCodes(rawText, F867_TAX_CODES);

  return {
    ordinaryDividendsILS,
    interestILS,
    netCapitalGainsILS: Math.max(0, grossGain - carriedLoss),
    taxWithheldILS,
  };
}

// Ordered longest-first so "בנק הפועלים" matches before "הפועלים"
const KNOWN_BANKS = [
  "בנק הפועלים",
  "בנק לאומי",
  "בנק דיסקונט",
  "מזרחי טפחות",
  "הבינלאומי",
  "בנק יהב",
  "בנק מרכנתיל",
  "בנק ירושלים",
  "הפועלים",
  "לאומי",
  "דיסקונט",
  "מזרחי",
  "הפניקס",
  "מגדל",
  "כלל",
  "הראל",
  "מנורה",
];

/** C. FBAR — bank name, account number, max balance, joint flag. */
export function FbarBalanceExtractor(rawText: string): FbarData {
  const t = normalizeText(rawText);

  // Bank name: scan the header region (first ~300 chars) first to avoid
  // matching a *transaction counterparty* (e.g. "בנק הפועלים" in a Leumi statement).
  let bankName = "";
  const header = t.slice(0, 300);
  for (const name of KNOWN_BANKS) {
    if (header.includes(name) || header.includes(reverseStr(name))) {
      bankName = name;
      break;
    }
  }
  // Fall back to full-text scan if header had nothing (logo-only headers).
  if (!bankName) {
    for (const name of KNOWN_BANKS) {
      if (t.includes(name) || t.includes(reverseStr(name))) {
        bankName = name;
        break;
      }
    }
  }

  // Account number: prefer "מספר חשבון" context; fall back to longest digit-dash run.
  let accountNumber = "";
  const ctxMatch = t.match(/(?:מספר\s+חשבון|מס['']\s*חשבון)[^\d]*(\d[\d\-]{4,})/);
  if (ctxMatch) {
    accountNumber = ctxMatch[1];
  } else {
    const runs = (t.match(/\d[\d\-]{4,}\d/g) ?? []).sort(
      (a, b) => b.replace(/\D/g, "").length - a.replace(/\D/g, "").length
    );
    accountNumber = runs[0] ?? "";
  }

  // Joint account: look for a comma in the account-holder line.
  const lines = t.split(/\r?\n/);
  const holderLine = lines.find(
    (l) => hasAnyPhrase(l, ["שם חשבון", "בעל חשבון", "שם המחזיק"])
  );
  const isJoint = holderLine
    ? holderLine.includes(",") || holderLine.includes("،")
    : false;

  // Max balance: take the largest money value in the document.
  // This correctly handles running-balance columns (יתרה מצטברת) and
  // end-of-year confirmations alike — the peak balance is always the max.
  const all = moneyTokens(t.replace(/\n/g, " "));
  const maxBalanceILS = all.length ? Math.max(...all) : 0;

  return { bankName, accountNumber, maxBalanceILS, isJoint };
}

// ---- Router ---------------------------------------------------------------

/** Run a single raw-text string through classify + the matching extractor. */
export function routeAndExtract(rawText: string): ExtractionResult {
  const type = classifyDocument(rawText);
  let data: ExtractedData = null;
  switch (type) {
    case DocumentType.FORM_106:
      data = Form106Extractor(rawText);
      break;
    case DocumentType.FORM_867:
      data = Form867Extractor(rawText);
      break;
    case DocumentType.BANK_FBAR:
      data = FbarBalanceExtractor(rawText);
      break;
    default:
      data = null;
  }
  return { type, label: DOCUMENT_LABELS[type], data, rawText };
}

/** Full pipeline for a dropped file: extract text -> route -> extract. */
export async function processDocument(
  file: File,
  onProgress?: (pct: number) => void
): Promise<ExtractionResult> {
  const rawText = await extractText(file, onProgress);
  return routeAndExtract(rawText);
}

// Type guards for the UI.
export const isForm106 = (r: ExtractionResult): r is ExtractionResult & {
  data: Form106Data;
} => r.type === DocumentType.FORM_106;
export const isForm867 = (r: ExtractionResult): r is ExtractionResult & {
  data: Form867Data;
} => r.type === DocumentType.FORM_867;
export const isFbar = (r: ExtractionResult): r is ExtractionResult & {
  data: FbarData;
} => r.type === DocumentType.BANK_FBAR;
