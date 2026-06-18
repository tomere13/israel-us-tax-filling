// Fill the genuine 2025 IRS PDFs (public/forms/2025/*.pdf) with the app's own
// computed values, client-side via pdf-lib. Replaces the 2024-frozen filler-api.
//
// These are review-grade DRAFTS: the FEIE stacking worksheet, AMT, Schedule 1/3
// detail, PFIC (8621) and capital-gains rates are not modeled. Verify before filing.
// ponytail: only the ~25 boxes the app is confident about are filled; everything
// else stays blank for the reviewer.

import { PDFDocument, PDFTextField, PDFCheckBox } from "pdf-lib";
import type { AppState } from "../types";
import { ilsToUsd } from "./currency";
import { estimate } from "./estimate";
import { yearData } from "./taxData";
import { F1040, F1116, F2555, FILING_STATUS_1040_FIELD } from "./formFields2025";

const ISRAEL = "Israel";

/** Whole-dollar string; blank for ~zero so the form isn't littered with 0s. */
const m = (n: number) => (n && Math.abs(n) >= 1 ? String(Math.round(n)) : "");

/** Set text fields by terminal token; returns tokens that didn't resolve. */
function applyText(
  form: ReturnType<PDFDocument["getForm"]>,
  values: Record<string, string>
): string[] {
  const byToken = new Map<string, ReturnType<typeof form.getFields>[number]>();
  for (const f of form.getFields()) byToken.set(f.getName().split(".").pop()!, f);
  const missing: string[] = [];
  for (const [token, val] of Object.entries(values)) {
    if (!val) continue;
    const f = byToken.get(token);
    if (!f) {
      missing.push(token);
      continue;
    }
    if (f instanceof PDFTextField) f.setText(val);
  }
  return missing;
}

/** 1040 filing status: check the one c1_8 box matching the status. */
function selectFilingStatus(
  form: ReturnType<PDFDocument["getForm"]>,
  status: string
) {
  const field = FILING_STATUS_1040_FIELD[status];
  if (!field) return;
  try {
    form.getCheckBox(field).check();
  } catch {
    /* field-name drift — leave unchecked rather than crash the whole fill */
  }
}

// ---- value builders (pure) -------------------------------------------------

interface Values1040 {
  text: Record<string, string>;
  filingStatus: string;
}

function values1040(s: AppState): Values1040 {
  const est = estimate(s);
  const yd = yearData(s.taxYear);
  const tp = s.taxpayer;
  const salaryUsd = s.incomes.reduce(
    (a, i) => a + ilsToUsd(i.grossAmountILS, s.exchangeRateAvg),
    0
  );
  const totalIncome = salaryUsd + est.passiveUsd;
  const agi = totalIncome - est.feieExcludedUsd;
  const stdDed = yd.stdDeduction[tp.filingStatus];
  const taxAfterCredits = Math.max(
    0,
    est.tentativeTaxUsd - est.foreignTaxCreditUsd - est.ctcUsd
  );
  const totalTax = taxAfterCredits + est.seTaxUsd;

  const isMfj = tp.filingStatus === "Married filing jointly";
  const text: Record<string, string> = {
    [F1040.firstNameMI]: tp.firstName,
    [F1040.lastName]: tp.lastName,
    [F1040.ssn]: tp.ssn,
    [F1040.address]: tp.address.street,
    [F1040.city]: tp.address.city,
    [F1040.zip]: tp.address.zip,
    [F1040.foreignCountry]: tp.address.country || ISRAEL,
    [F1040.line1aWages]: m(salaryUsd),
    [F1040.line1zWages]: m(salaryUsd),
    [F1040.line9TotalIncome]: m(totalIncome),
    [F1040.line11Agi]: m(agi),
    [F1040.line12StdDeduction]: m(stdDed),
    [F1040.line15Taxable]: m(est.taxableUsd),
    [F1040.line16Tax]: m(est.tentativeTaxUsd),
    [F1040.line22]: m(taxAfterCredits),
    [F1040.line24TotalTax]: m(totalTax),
  };
  if (s.foreignIncomeMethod === "1116")
    text[F1040.line20Sched3] = m(est.foreignTaxCreditUsd);
  if (est.estimatedOwedUsd > 0) text[F1040.line37Owe] = m(est.estimatedOwedUsd);
  else if (est.estimatedOwedUsd < 0)
    text[F1040.line34Refund] = m(-est.estimatedOwedUsd);
  void isMfj;
  return { text, filingStatus: tp.filingStatus };
}

function values1116(s: AppState): Record<string, string> {
  const est = estimate(s);
  const tp = s.taxpayer;
  const foreignIncomeUsd =
    s.incomes.reduce((a, i) => a + ilsToUsd(i.grossAmountILS, s.exchangeRateAvg), 0) +
    est.passiveUsd;
  const foreignTaxPaidUsd =
    s.incomes.reduce((a, i) => a + ilsToUsd(i.taxPaidILS, s.exchangeRateAvg), 0) +
    s.passive.reduce((a, p) => a + ilsToUsd(p.taxPaidILS, s.exchangeRateAvg), 0);
  return {
    [F1116.name]: `${tp.firstName} ${tp.lastName}`.trim(),
    [F1116.ssn]: tp.ssn,
    [F1116.residentCountry]: ISRAEL,
    [F1116.line1aGrossIncomeColA]: m(foreignIncomeUsd),
    [F1116.line7NetForeignIncome]: m(foreignIncomeUsd),
    [F1116.line14TotalForeignTax]: m(foreignTaxPaidUsd),
    [F1116.line20TaxAgainstCredit]: m(est.tentativeTaxUsd),
    [F1116.line24CategoryCredit]: m(est.foreignTaxCreditUsd),
    [F1116.line35CreditToSched3]: m(est.foreignTaxCreditUsd),
  };
}

function values2555(s: AppState): Record<string, string> {
  const est = estimate(s);
  const yd = yearData(s.taxYear);
  const tp = s.taxpayer;
  const salaryUsd = s.incomes.reduce(
    (a, i) => a + ilsToUsd(i.grossAmountILS, s.exchangeRateAvg),
    0
  );
  return {
    [F2555.name]: `${tp.firstName} ${tp.lastName}`.trim(),
    [F2555.ssn]: tp.ssn,
    [F2555.citizenCountry]: ISRAEL,
    [F2555.line19Wages]: m(salaryUsd),
    [F2555.line24TotalForeignEarned]: m(est.earnedUsd),
    [F2555.line26ForeignEarned]: m(est.earnedUsd),
    [F2555.line37MaxExclusion]: m(yd.feieLimit),
    [F2555.line42Exclusion]: m(est.feieExcludedUsd),
  };
}

// ---- fill + assemble -------------------------------------------------------

async function fillDoc(
  blank: Uint8Array | ArrayBuffer,
  text: Record<string, string>,
  filingStatus?: string
): Promise<{ doc: PDFDocument; form: ReturnType<PDFDocument["getForm"]>; missing: string[] }> {
  const doc = await PDFDocument.load(blank);
  const form = doc.getForm();
  const missing = applyText(form, text);
  if (filingStatus) selectFilingStatus(form, filingStatus);
  return { doc, form, missing };
}

// Keeps fields interactive (for the demo round-trip read-back).
async function fill(
  blank: Uint8Array | ArrayBuffer,
  text: Record<string, string>,
  filingStatus?: string
): Promise<{ bytes: Uint8Array; missing: string[] }> {
  const { doc, missing } = await fillDoc(blank, text, filingStatus);
  return { bytes: await doc.save(), missing };
}

async function fetchBlank(form: string, year = 2025): Promise<ArrayBuffer> {
  const res = await fetch(`/forms/${year}/${form}.pdf`);
  if (!res.ok) throw new Error(`Missing blank ${form} (${res.status})`);
  return res.arrayBuffer();
}

export interface GeneratedForm {
  name: string; // file name, e.g. "irs-forms-2025.pdf"
  bytes: Uint8Array;
}

/**
 * Build the filled IRS PDFs the current method needs and merge them into ONE
 * file: 1040 + (1116 if FTC, else 2555). A single download avoids the browser
 * blocking the 2nd+ programmatic download (which dropped the foreign form before).
 * Pages are flattened so the values always render (and can't be edited away).
 */
export async function generateForms(s: AppState): Promise<GeneratedForm[]> {
  const merged = await PDFDocument.create();

  const append = async (
    blankName: string,
    text: Record<string, string>,
    filingStatus?: string
  ) => {
    const { doc, form } = await fillDoc(
      await fetchBlank(blankName, s.taxYear),
      text,
      filingStatus
    );
    form.flatten();
    const pages = await merged.copyPages(doc, doc.getPageIndices());
    pages.forEach((p) => merged.addPage(p));
  };

  const v1040 = values1040(s);
  await append("f1040", v1040.text, v1040.filingStatus);
  if (s.foreignIncomeMethod === "1116") await append("f1116", values1116(s));
  else await append("f2555", values2555(s));

  const bytes = await merged.save();
  return [{ name: `irs-forms-${s.taxYear}.pdf`, bytes }];
}

// ---------------------------------------------------------------------------
// ponytail: sentinel round-trip self-check. Fills each blank, reloads, and
// asserts every mapped token resolved and read back — catches a wrong field name
// silently dropping a value. Run with `npx tsx src/utils/fillForms.ts`.
export async function demo() {
  // ponytail: `as string` keeps tsc from resolving node:fs (no @types/node in the
  // browser build); demo() only ever runs under tsx/Node.
  const { readFileSync } = await import("node:fs" as string);
  const load = (f: string) =>
    new Uint8Array(readFileSync(`public/forms/2025/${f}.pdf`));

  const sample: AppState = {
    taxYear: 2025,
    exchangeRateAvg: 3.5,
    exchangeRateEOY: 3.4,
    foreignIncomeMethod: "1116",
    taxpayer: {
      firstName: "Dana",
      lastName: "Cohen",
      ssn: "123456789",
      occupation: "Engineer",
      filingStatus: "Married filing jointly",
      phone: "",
      email: "",
      address: { street: "1 Herzl St", city: "Tel Aviv", zip: "6100000", country: "Israel" },
    },
    incomes: [{ id: "1", sourceName: "Employer", grossAmountILS: 420000, taxPaidILS: 110000 }],
    passive: [{ id: "p", kind: "interest", sourceName: "Bank", amountILS: 12000, taxPaidILS: 3000 }],
    fbarAccounts: [],
    dependents: [],
    selfEmployment: [],
  };

  // 1040: fill, assert no missing tokens, reload and read back a representative box.
  const v = values1040(sample);
  const r = await fill(load("f1040"), v.text, v.filingStatus);
  console.assert(r.missing.length === 0, "1040 unresolved tokens: " + r.missing.join(","));
  const back = await PDFDocument.load(r.bytes);
  const f = back.getForm();
  const read = (token: string) => {
    const fld = f.getFields().find((x) => x.getName().endsWith(token));
    return fld instanceof PDFTextField ? fld.getText() : undefined;
  };
  console.assert(read(F1040.lastName) === "Cohen", "1040 last name round-trip");
  console.assert(read(F1040.line1zWages) === "120000", "1040 wages round-trip (got " + read(F1040.line1zWages) + ")");
  // MFJ filing-status box must be checked after fill.
  const mfjBox = f.getFields().find(
    (x) => x.getName() === "topmostSubform[0].Page1[0].Checkbox_ReadOrder[0].c1_8[1]"
  );
  console.assert(
    mfjBox instanceof PDFCheckBox && mfjBox.isChecked(),
    "1040 MFJ filing-status box checked"
  );

  // 1116 + 2555: assert all mapped tokens resolve against the real PDFs.
  const r1116 = await fill(load("f1116"), values1116(sample));
  console.assert(r1116.missing.length === 0, "1116 unresolved tokens: " + r1116.missing.join(","));
  const r2555 = await fill(load("f2555"), values2555({ ...sample, foreignIncomeMethod: "2555" }));
  console.assert(r2555.missing.length === 0, "2555 unresolved tokens: " + r2555.missing.join(","));

  console.log("fillForms demo ok");
}

const _argv = (globalThis as { process?: { argv?: string[] } }).process?.argv;
if (_argv && import.meta.url === `file://${_argv[1]}`) demo();
