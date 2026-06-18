// Which IRS forms this filing needs, and the expat deadlines. Pure over AppState.
// ponytail: thresholds hard-coded per the rules; no calendar/date lib.

import type { AppState } from "../types";
import { ilsToUsd } from "./currency";
import { estimate } from "./estimate";

export interface FormReq {
  form: string; // display name, e.g. "Form 8938"
  key: string; // i18n key under t.review.forms for the "why" line
  generated: boolean; // true = produced by the PDF filler; false = file manually
}

const MFJ = (s: AppState) =>
  s.taxpayer.filingStatus === "Married filing jointly" ||
  s.taxpayer.filingStatus === "Qualifying widow(er)";

export function requiredForms(s: AppState): FormReq[] {
  const out: FormReq[] = [
    { form: "Form 1040", key: "f1040", generated: true },
  ];

  const interestDiv = s.passive
    .filter((p) => p.kind === "interest" || p.kind === "dividends")
    .reduce((a, p) => a + ilsToUsd(p.amountILS, s.exchangeRateAvg), 0);
  if (interestDiv > 1_500)
    out.push({ form: "Schedule B", key: "schedB", generated: false });

  const foreignTaxPaid =
    s.incomes.some((i) => i.taxPaidILS > 0) ||
    s.passive.some((p) => p.taxPaidILS > 0);
  if (s.foreignIncomeMethod === "1116" && foreignTaxPaid) {
    out.push({ form: "Form 1116", key: "f1116", generated: true });
    // The FTC from 1116 reaches the 1040 via Schedule 3 (line 8) — file it too.
    out.push({ form: "Schedule 3", key: "sched3", generated: false });
  }

  const earned =
    s.incomes.reduce((a, i) => a + i.grossAmountILS, 0) +
    s.selfEmployment.reduce((a, e) => a + e.grossILS - e.expensesILS, 0);
  if (s.foreignIncomeMethod === "2555" && earned > 0)
    out.push({ form: "Form 2555", key: "f2555", generated: true });

  // NIIT (Form 8960): the FTC does not offset it, so flag whenever it applies.
  if (estimate(s).niitUsd > 0)
    out.push({ form: "Form 8960", key: "f8960", generated: false });

  // PFIC (Form 8621): non-US funds/ETFs trigger a form per fund. We can't detect
  // holdings, so flag when there are dividends/capital gains worth checking.
  if (s.passive.some((p) => p.kind === "dividends" || p.kind === "capital_gains"))
    out.push({ form: "Form 8621 (PFIC)?", key: "f8621", generated: false });

  if (s.selfEmployment.length > 0) {
    out.push({ form: "Schedule C", key: "schedC", generated: false });
    out.push({ form: "Schedule SE", key: "schedSE", generated: false });
  }

  if (s.dependents.length > 0)
    out.push({ form: "Schedule 8812", key: "sched8812", generated: false });

  // FBAR (FinCEN 114) — aggregate max balances over $10k at any point.
  const fbarUsd = s.fbarAccounts.reduce(
    (a, x) => a + ilsToUsd(x.maxBalanceILS, s.exchangeRateEOY),
    0
  );
  if (fbarUsd > 10_000)
    out.push({ form: "FinCEN 114 (FBAR)", key: "fbar", generated: false });

  // Form 8938 — living abroad thresholds (using max balance as the high-water proxy).
  const eoyLimit = MFJ(s) ? 400_000 : 200_000;
  const anyLimit = MFJ(s) ? 600_000 : 300_000;
  if (fbarUsd > eoyLimit || fbarUsd > anyLimit)
    out.push({ form: "Form 8938", key: "f8938", generated: false });

  return out;
}

/** Expat filing deadlines for the season after `taxYear`. */
export function deadlines(taxYear: number) {
  const y = taxYear + 1;
  return {
    abroad: `June 16, ${y}`, // automatic 2-month extension for filers abroad
    extended: `October 15, ${y}`, // Form 4868 extension
    fbar: `October 15, ${y}`, // FBAR auto-extension (April 15 → Oct 15)
  };
}

// ponytail: assert-based self-check; run with `tsx src/utils/forms.ts`.
export function demo() {
  const base: AppState = {
    taxYear: 2025,
    exchangeRateAvg: 3.451,
    exchangeRateEOY: 3.3,
    foreignIncomeMethod: "1116",
    taxpayer: {
      firstName: "A",
      lastName: "B",
      ssn: "123456789",
      occupation: "",
      filingStatus: "Single",
      phone: "",
      email: "",
      address: { street: "", city: "", zip: "", country: "Israel" },
    },
    incomes: [{ id: "1", sourceName: "x", grossAmountILS: 350000, taxPaidILS: 90000 }],
    passive: [],
    fbarAccounts: [],
    dependents: [],
    selfEmployment: [],
  };
  const names = (s: AppState) => requiredForms(s).map((f) => f.form);

  console.assert(names(base).includes("Form 1116"), "1116 when FTC + tax paid");

  // $10k FBAR boundary: 36,300 ILS / 3.3 = $11,000 → over.
  const fbarOver = {
    ...base,
    fbarAccounts: [
      { id: "a", bankName: "X", accountNumber: "", bankAddress: "", maxBalanceILS: 36300, isJoint: false },
    ],
  };
  console.assert(names(fbarOver).includes("FinCEN 114 (FBAR)"), "FBAR over $10k");
  console.assert(!names(base).includes("FinCEN 114 (FBAR)"), "no FBAR when no accounts");

  // 8938 single threshold $200k → 660,001 ILS / 3.3 = $200,000.3.
  const big = {
    ...base,
    fbarAccounts: [
      { id: "a", bankName: "X", accountNumber: "", bankAddress: "", maxBalanceILS: 660001, isJoint: false },
    ],
  };
  console.assert(names(big).includes("Form 8938"), "8938 over $200k single");

  // Schedule B boundary: interest $1,500.x → 5,177 ILS / 3.451 ≈ $1,500.4.
  const schedB = {
    ...base,
    passive: [{ id: "p", kind: "interest" as const, sourceName: "", amountILS: 5177, taxPaidILS: 0 }],
  };
  console.assert(names(schedB).includes("Schedule B"), "Schedule B over $1,500");

  console.assert(deadlines(2025).abroad.includes("2026"), "deadline year = taxYear+1");
  console.log("forms demo ok");
}

// ponytail: run only when executed directly under tsx (no @types/node needed).
const _argv = (globalThis as { process?: { argv?: string[] } }).process?.argv;
if (_argv && import.meta.url === `file://${_argv[1]}`) demo();
