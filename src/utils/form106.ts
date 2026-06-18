// Local-only parsing engine for the Israeli "Form 106" (טופס 106).
// PDFs go through pdf.js text extraction; images go through tesseract.js OCR.
// We then run a regex hunt for the standard Tofes 106 field codes.

import * as pdfjsLib from "pdfjs-dist";
// Vite resolves this to a bundled worker URL.
import PdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { findByCodes } from "./parse";

pdfjsLib.GlobalWorkerOptions.workerSrc = PdfWorker;

export interface ParseResult {
  sourceName: string;
  grossAmountILS: number;
  taxPaidILS: number;
  rawText: string;
  matchedGrossCode?: string;
  matchedTaxCode?: string;
}

// Israeli Form 106 field codes.
const GROSS_CODES = ["158", "172"]; // Gross salary / taxable income.
const TAX_CODES = ["042", "048"]; // Income tax withheld.

export function parseForm106Text(
  text: string,
  sourceName: string
): ParseResult {
  const gross = findByCodes(text, GROSS_CODES);
  const tax = findByCodes(text, TAX_CODES);
  return {
    sourceName,
    grossAmountILS: gross.value,
    taxPaidILS: tax.value,
    rawText: text,
    matchedGrossCode: gross.code,
    matchedTaxCode: tax.code,
  };
}

/** Extract the text layer of an already-loaded pdf.js document. */
async function extractTextLayer(pdf: any): Promise<string> {
  let out = "";
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    // Group items into lines using their y-coordinate.
    const rows = new Map<number, { x: number; str: string }[]>();
    for (const item of content.items as any[]) {
      if (typeof item.str !== "string") continue;
      const y = Math.round(item.transform[5]);
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y)!.push({ x: item.transform[4], str: item.str });
    }
    const sortedY = [...rows.keys()].sort((a, b) => b - a);
    for (const y of sortedY) {
      const line = rows
        .get(y)!
        .sort((a, b) => a.x - b.x)
        .map((c) => c.str)
        .join(" ");
      out += line + "\n";
    }
  }
  return out;
}

/**
 * Render each PDF page to a canvas and OCR it. Needed for documents (like
 * HILAN-generated Form 106) whose embedded fonts have no Unicode mapping, so
 * the text layer is empty/garbled and only OCR can recover the numbers.
 */
async function ocrPdfPages(
  pdf: any,
  onProgress?: (pct: number) => void
): Promise<string> {
  const Tesseract = await import("tesseract.js");
  let out = "";
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale: 2.5 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    const { data } = await Tesseract.recognize(canvas, "heb+eng", {
      logger: (m: any) => {
        if (m.status === "recognizing text" && onProgress) {
          onProgress(Math.round((m.progress ?? 0) * 100));
        }
      },
    });
    out += data.text + "\n";
  }
  return out;
}

/** Heuristic: did text extraction recover enough to parse Form 106? */
function textIsWeak(text: string): boolean {
  const digitGroups = text.match(/\d{2,}/g) ?? [];
  return text.replace(/\s/g, "").length < 40 || digitGroups.length < 3;
}

/**
 * Extract text from a PDF: try the embedded text layer first, then fall back
 * to rendering + OCR when the text layer is missing or unusable.
 */
export async function extractPdfText(
  file: File,
  onProgress?: (pct: number) => void
): Promise<string> {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const layer = await extractTextLayer(pdf);
  if (!textIsWeak(layer)) return layer;
  return ocrPdfPages(pdf, onProgress);
}

/** OCR an image file using tesseract.js (Hebrew + English). */
export async function extractImageText(
  file: File,
  onProgress?: (pct: number) => void
): Promise<string> {
  const Tesseract = await import("tesseract.js");
  const { data } = await Tesseract.recognize(file, "heb+eng", {
    logger: (m: any) => {
      if (m.status === "recognizing text" && onProgress) {
        onProgress(Math.round((m.progress ?? 0) * 100));
      }
    },
  });
  return data.text;
}

/** Dispatch by file type and return both parsed fields and raw text. */
export async function parseForm106File(
  file: File,
  onProgress?: (pct: number) => void
): Promise<ParseResult> {
  const isPdf =
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  const text = isPdf
    ? await extractPdfText(file, onProgress)
    : await extractImageText(file, onProgress);
  return parseForm106Text(text, file.name.replace(/\.[^.]+$/, ""));
}
