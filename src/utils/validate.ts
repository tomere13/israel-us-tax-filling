// Pure validation over AppState. No React, no i18n — returns stable keys the
// UI maps to localized messages. ponytail: a flat list of checks, not a schema lib.

import type { AppState } from "../types";

export interface Issue {
  step: number; // 0-based wizard step the issue belongs to
  severity: "error" | "warn";
  key: string; // i18n key under t.review.issues
}

const digits = (s: string) => s.replace(/\D/g, "");

export function validate(s: AppState): Issue[] {
  const out: Issue[] = [];

  if (!s.taxpayer.firstName.trim() || !s.taxpayer.lastName.trim())
    out.push({ step: 0, severity: "error", key: "nameMissing" });

  const ssn = digits(s.taxpayer.ssn);
  if (!ssn) out.push({ step: 0, severity: "error", key: "ssnMissing" });
  else if (ssn.length !== 9)
    out.push({ step: 0, severity: "error", key: "ssnFormat" });

  if (!(s.exchangeRateAvg > 0))
    out.push({ step: 0, severity: "error", key: "rateAvg" });
  if (!(s.exchangeRateEOY > 0))
    out.push({ step: 0, severity: "error", key: "rateEoy" });

  const hasEarned =
    s.incomes.length > 0 || s.selfEmployment.length > 0;
  if (!hasEarned && s.passive.length === 0)
    out.push({ step: 1, severity: "warn", key: "noIncome" });

  for (const a of s.fbarAccounts) {
    if (!a.bankName.trim())
      out.push({ step: 3, severity: "warn", key: "fbarNoName" });
    if (!(a.maxBalanceILS > 0))
      out.push({ step: 3, severity: "warn", key: "fbarNoBalance" });
  }

  for (const d of s.dependents) {
    if (digits(d.ssn).length !== 9)
      out.push({ step: 0, severity: "warn", key: "dependentSsn" });
  }

  // Schedule B Part III: the foreign-account "Yes" box is required whenever you
  // hold a foreign account, regardless of the $1,500 interest threshold.
  if (s.fbarAccounts.length > 0)
    out.push({ step: 3, severity: "warn", key: "schedBForeign" });

  return out;
}

// ponytail: assert-based self-check; run with `tsx src/utils/validate.ts`.
export function demo() {
  const base: AppState = {
    taxYear: 2025,
    exchangeRateAvg: 3.451,
    exchangeRateEOY: 3.3,
    foreignIncomeMethod: "2555",
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
    incomes: [{ id: "1", sourceName: "x", grossAmountILS: 100, taxPaidILS: 0 }],
    passive: [],
    fbarAccounts: [],
    dependents: [],
    selfEmployment: [],
  };
  console.assert(validate(base).length === 0, "clean state should pass");
  console.assert(
    validate({ ...base, taxpayer: { ...base.taxpayer, ssn: "123" } }).some(
      (i) => i.key === "ssnFormat"
    ),
    "short SSN should flag ssnFormat"
  );
  console.assert(
    validate({ ...base, exchangeRateAvg: 0 }).some((i) => i.key === "rateAvg"),
    "zero rate should flag rateAvg"
  );
  console.log("validate demo ok");
}

// ponytail: run only when executed directly under tsx (no @types/node needed).
const _argv = (globalThis as { process?: { argv?: string[] } }).process?.argv;
if (_argv && import.meta.url === `file://${_argv[1]}`) demo();
