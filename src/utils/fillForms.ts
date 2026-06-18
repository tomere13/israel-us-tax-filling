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
import { estimate, shares, ftc1116 } from "./estimate";
import { yearData } from "./taxData";
import {
  F1040,
  F1116,
  F2555,
  FILING_STATUS_1040_FIELD,
  F1116_CATEGORY,
  F1116_PAID_BOX,
} from "./formFields2025";

const US_COUNTRY = /^(us|u\.s\.|usa|united states)$/i;

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
  const sh = shares(s);
  const yd = yearData(s.taxYear);
  const tp = s.taxpayer;
  // All passive figures are the taxpayer's share (joint accounts already halved).
  const totalIncome = sh.wagesUsd + sh.interestUsd + sh.dividendsUsd + sh.gainsUsd;
  const agi = totalIncome - est.feieExcludedUsd;
  const stdDed = yd.stdDeduction[tp.filingStatus];
  const taxAfterCredits = Math.max(
    0,
    est.tentativeTaxUsd - est.foreignTaxCreditUsd - est.ctcUsd
  );
  const totalTax = taxAfterCredits + est.seTaxUsd + est.niitUsd;

  const text: Record<string, string> = {
    [F1040.firstNameMI]: tp.firstName,
    [F1040.lastName]: tp.lastName,
    [F1040.ssn]: tp.ssn,
    [F1040.address]: tp.address.street,
    [F1040.city]: tp.address.city,
    [F1040.line1aWages]: m(sh.wagesUsd),
    [F1040.line1zWages]: m(sh.wagesUsd),
    [F1040.line2bInterest]: m(sh.interestUsd),
    [F1040.line3bDividends]: m(sh.dividendsUsd),
    [F1040.line7CapGain]: m(sh.gainsUsd),
    [F1040.line9TotalIncome]: m(totalIncome),
    [F1040.line11Agi]: m(agi),
    [F1040.line12StdDeduction]: m(stdDed),
    [F1040.line15Taxable]: m(est.taxableUsd),
    [F1040.line16Tax]: m(est.tentativeTaxUsd),
    [F1040.line22]: m(taxAfterCredits),
    [F1040.line24TotalTax]: m(totalTax),
  };

  // Foreign address: route to the foreign-address fields; leave US state/ZIP blank.
  const country = (tp.address.country || "").trim();
  if (country !== "" && !US_COUNTRY.test(country)) {
    text[F1040.foreignCountry] = country;
    text[F1040.foreignPostal] = tp.address.zip;
  } else {
    text[F1040.zip] = tp.address.zip;
  }

  // MFS with a Non-Resident-Alien spouse: name on the MFS line, "NRA" in the SSN box.
  if (tp.filingStatus === "Married filing separately") {
    if (tp.spouseName) text[F1040.spouseNameMfs] = tp.spouseName;
    if (tp.spouseIsNRA) text[F1040.spouseSsn] = "NRA";
  }

  if (s.foreignIncomeMethod === "1116")
    text[F1040.line20Sched3] = m(est.foreignTaxCreditUsd);
  if (est.estimatedOwedUsd > 0) text[F1040.line37Owe] = m(est.estimatedOwedUsd);
  else if (est.estimatedOwedUsd < 0)
    text[F1040.line34Refund] = m(-est.estimatedOwedUsd);
  return { text, filingStatus: tp.filingStatus };
}

export type Category1116 = "general" | "passive";

interface Form1116 {
  text: Record<string, string>;
  checkBoxes: string[];
}

/** One Form 1116 per income category: general (wages) or passive (interest/div/gains). */
function values1116(s: AppState, category: Category1116): Form1116 {
  const est = estimate(s);
  const tp = s.taxpayer;
  const ftc = ftc1116(s, est.taxableUsd, est.tentativeTaxUsd);
  const c = ftc[category]; // { incomeUsd, taxUsd, taxIls, ratio, limitUsd, creditUsd }
  const text: Record<string, string> = {
    [F1116.name]: `${tp.firstName} ${tp.lastName}`.trim(),
    [F1116.ssn]: tp.ssn,
    [F1116.residentCountry]: ISRAEL,
    [F1116.partICountryA]: ISRAEL,
    [F1116.line1aGrossIncomeColA]: m(c.incomeUsd),
    [F1116.line7NetForeignIncome]: m(c.incomeUsd),
    [F1116.line14TotalForeignTax]: m(c.taxUsd),
    // Part III limitation: credit = min(foreign tax, US tax × income ratio).
    [F1116.line15NetForeign]: m(c.incomeUsd),
    [F1116.line17NetForeignTaxable]: m(c.incomeUsd),
    [F1116.line18TotalTaxable]: m(est.taxableUsd),
    [F1116.line19Ratio]: c.ratio > 0 ? c.ratio.toFixed(4) : "",
    [F1116.line20TaxAgainstCredit]: m(est.tentativeTaxUsd),
    [F1116.line21Limitation]: m(c.limitUsd),
    [F1116.line23]: m(c.limitUsd),
    [F1116.line24CategoryCredit]: m(c.creditUsd),
    [F1116.line33Smaller]: m(c.creditUsd), // Part IV: min(line 20, line 32=line 24)
    [F1116.line35CreditToSched3]: m(c.creditUsd),
    [F1116.p2RowTotalUsd]: m(c.taxUsd),
  };
  // Part II row A: wages → "other" columns; interest/div/gains → interest columns.
  if (category === "passive") {
    text[F1116.p2UsdInterest] = m(c.taxUsd);
    text[F1116.p2NisInterest] = m(c.taxIls);
  } else {
    text[F1116.p2UsdOther] = m(c.taxUsd);
    text[F1116.p2NisOther] = m(c.taxIls);
  }
  const categoryBox =
    category === "general" ? F1116_CATEGORY.general : F1116_CATEGORY.passive;
  return { text, checkBoxes: [categoryBox, F1116_PAID_BOX] };
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

interface FillOpts {
  filingStatus?: string;
  checkBoxes?: string[]; // full field names to .check() (1116 category + Paid box)
}

async function fillDoc(
  blank: Uint8Array | ArrayBuffer,
  text: Record<string, string>,
  opts: FillOpts = {}
): Promise<{ doc: PDFDocument; form: ReturnType<PDFDocument["getForm"]>; missing: string[] }> {
  const doc = await PDFDocument.load(blank);
  const form = doc.getForm();
  const missing = applyText(form, text);
  if (opts.filingStatus) selectFilingStatus(form, opts.filingStatus);
  for (const cb of opts.checkBoxes ?? []) {
    try {
      form.getCheckBox(cb).check();
    } catch {
      /* field-name drift — skip rather than crash the whole fill */
    }
  }
  return { doc, form, missing };
}

// Keeps fields interactive (for the demo round-trip read-back).
async function fill(
  blank: Uint8Array | ArrayBuffer,
  text: Record<string, string>,
  opts: FillOpts = {}
): Promise<{ bytes: Uint8Array; missing: string[] }> {
  const { doc, missing } = await fillDoc(blank, text, opts);
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
    opts: FillOpts = {}
  ) => {
    const { doc, form } = await fillDoc(await fetchBlank(blankName, s.taxYear), text, opts);
    form.flatten();
    const pages = await merged.copyPages(doc, doc.getPageIndices());
    pages.forEach((p) => merged.addPage(p));
  };

  const v1040 = values1040(s);
  await append("f1040", v1040.text, { filingStatus: v1040.filingStatus });

  if (s.foreignIncomeMethod === "1116") {
    const sh = shares(s);
    // One 1116 per category that has foreign tax (general = wages, passive = interest/div/gains).
    if (sh.wageTaxUsd > 0) {
      const g = values1116(s, "general");
      await append("f1116", g.text, { checkBoxes: g.checkBoxes });
    }
    if (sh.passiveTaxUsd > 0) {
      const p = values1116(s, "passive");
      await append("f1116", p.text, { checkBoxes: p.checkBoxes });
    }
  } else {
    await append("f2555", values2555(s));
  }

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

  // MFS with an NRA spouse + a joint Bank Leumi account (the owner's real case).
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
      filingStatus: "Married filing separately",
      spouseName: "Daniel Vershkov",
      spouseIsNRA: true,
      phone: "",
      email: "",
      address: { street: "1 Herzl St", city: "Tel Aviv", zip: "8452738", country: "Israel" },
    },
    incomes: [{ id: "1", sourceName: "Employer", grossAmountILS: 420000, taxPaidILS: 110000 }],
    passive: [{ id: "p", kind: "interest", sourceName: "Bank Leumi", amountILS: 4203, taxPaidILS: 631, isJoint: true }],
    fbarAccounts: [],
    dependents: [],
    selfEmployment: [],
  };

  // 1040: fill, assert no missing tokens, reload and read back representative boxes.
  const v = values1040(sample);
  const r = await fill(load("f1040"), v.text, { filingStatus: v.filingStatus });
  console.assert(r.missing.length === 0, "1040 unresolved tokens: " + r.missing.join(","));
  const back = await PDFDocument.load(r.bytes);
  const f = back.getForm();
  const read = (token: string) => {
    const fld = f.getFields().find((x) => x.getName().endsWith(token));
    return fld instanceof PDFTextField ? fld.getText() : undefined;
  };
  console.assert(read(F1040.lastName) === "Cohen", "1040 last name round-trip");
  console.assert(read(F1040.spouseNameMfs) === "Daniel Vershkov", "MFS spouse name printed");
  console.assert(read(F1040.spouseSsn) === "NRA", "NRA in spouse SSN box");
  // Joint interest 4203/3.5/2 = 600.4 → "600" on line 2b.
  console.assert(read(F1040.line2bInterest) === "600", "line 2b = 50% joint interest (got " + read(F1040.line2bInterest) + ")");
  // Foreign address: US ZIP blank, postal in the foreign field.
  console.assert(!read(F1040.zip), "US ZIP left blank for foreign address");
  console.assert(read(F1040.foreignPostal) === "8452738", "ZIP routed to foreign postal");
  // No gap: line 9 = wages (120000) + interest (600).
  console.assert(read(F1040.line9TotalIncome) === "120600", "line 9 = 1z + 2b (got " + read(F1040.line9TotalIncome) + ")");
  const mfsBox = f.getFields().find(
    (x) => x.getName() === "topmostSubform[0].Page1[0].Checkbox_ReadOrder[0].c1_8[2]"
  );
  console.assert(mfsBox instanceof PDFCheckBox && mfsBox.isChecked(), "1040 MFS box checked");

  // Two 1116s: general (wages) box /4 and passive (interest) box /3, Part II + Paid set.
  // Line 24 is the Part III-LIMITED credit, not the raw tax: general is capped at the
  // US tax ($18,011, ratio→1) below the $31,429 paid; passive ($90) is under its limit.
  for (const [cat, catFull, creditStr] of [
    ["general", F1116_CATEGORY.general, "18011"],
    ["passive", F1116_CATEGORY.passive, "90"],
  ] as const) {
    const built = values1116(sample, cat);
    const rr = await fill(load("f1116"), built.text, { checkBoxes: built.checkBoxes });
    console.assert(rr.missing.length === 0, `1116 ${cat} unresolved: ` + rr.missing.join(","));
    const bf = (await PDFDocument.load(rr.bytes)).getForm();
    const box = bf.getFields().find((x) => x.getName() === catFull);
    console.assert(box instanceof PDFCheckBox && box.isChecked(), `1116 ${cat} category box checked`);
    const credit = bf.getFields().find((x) => x.getName().endsWith(F1116.line24CategoryCredit));
    console.assert(
      credit instanceof PDFTextField && credit.getText() === creditStr,
      `1116 ${cat} line 24 = ${creditStr} (got ${credit instanceof PDFTextField ? credit.getText() : "?"})`
    );
  }

  const r2555 = await fill(load("f2555"), values2555({ ...sample, foreignIncomeMethod: "2555" }));
  console.assert(r2555.missing.length === 0, "2555 unresolved tokens: " + r2555.missing.join(","));

  console.log("fillForms demo ok");
}

const _argv = (globalThis as { process?: { argv?: string[] } }).process?.argv;
if (_argv && import.meta.url === `file://${_argv[1]}`) demo();
