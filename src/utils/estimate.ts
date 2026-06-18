// Rough 1040 liability estimate for a US filer in Israel. Pure over AppState.
// ponytail: estimate only — NOT a substitute for software/a CPA. It ignores AMT,
// NIIT, the FEIE stacking rule, the SS wage-base cap, the ACTC 15%-of-earnings
// phase-in, capital-gains rates, and state tax. Good enough to show "you owe ~$0".

import type { AppState, PassiveRecord } from "../types";
import { ilsToUsd } from "./currency";
import { yearData, bracketTax } from "./taxData";

// Joint account → the taxpayer reports only their 50% share (NRA spouse files nothing).
export const passiveShareILS = (p: PassiveRecord) => (p.isJoint ? p.amountILS / 2 : p.amountILS);
export const passiveTaxShareILS = (p: PassiveRecord) => (p.isJoint ? p.taxPaidILS / 2 : p.taxPaidILS);

// Form 1116 Part III limitation, per income category. credit = min(foreign tax,
// US tax × (category foreign income ÷ total taxable income)); total capped at US tax.
export interface CategoryFtc {
  incomeUsd: number;
  taxUsd: number;
  taxIls: number;
  ratio: number; // line 19
  limitUsd: number; // line 21
  creditUsd: number; // line 24 = min(line 14, line 23)
}
export interface Ftc1116 {
  general: CategoryFtc;
  passive: CategoryFtc;
  totalCreditUsd: number; // Part IV line 33 = min(US tax, sum of credits)
}
export function ftc1116(s: AppState, taxableUsd: number, usTaxUsd: number): Ftc1116 {
  const sh = shares(s);
  const cat = (incomeUsd: number, taxUsd: number, taxIls: number): CategoryFtc => {
    const ratio = taxableUsd > 0 ? Math.min(1, incomeUsd / taxableUsd) : 0;
    const limitUsd = usTaxUsd * ratio;
    return { incomeUsd, taxUsd, taxIls, ratio, limitUsd, creditUsd: Math.min(taxUsd, limitUsd) };
  };
  const general = cat(sh.wagesUsd, sh.wageTaxUsd, sh.wageTaxILS);
  const passive = cat(sh.passiveUsd, sh.passiveTaxUsd, sh.passiveTaxILS);
  const totalCreditUsd = Math.min(usTaxUsd, general.creditUsd + passive.creditUsd);
  return { general, passive, totalCreditUsd };
}

/** Taxpayer-share sums used by both the estimate and the PDF filler (single source of truth). */
export function shares(s: AppState) {
  const avg = s.exchangeRateAvg;
  const kindUsd = (k: PassiveRecord["kind"]) =>
    s.passive.filter((p) => p.kind === k).reduce((a, p) => a + ilsToUsd(passiveShareILS(p), avg), 0);
  return {
    wagesUsd: s.incomes.reduce((a, i) => a + ilsToUsd(i.grossAmountILS, avg), 0),
    wageTaxUsd: s.incomes.reduce((a, i) => a + ilsToUsd(i.taxPaidILS, avg), 0),
    wageTaxILS: s.incomes.reduce((a, i) => a + i.taxPaidILS, 0),
    interestUsd: kindUsd("interest"),
    dividendsUsd: kindUsd("dividends"),
    gainsUsd: kindUsd("capital_gains"),
    passiveUsd: s.passive.reduce((a, p) => a + ilsToUsd(passiveShareILS(p), avg), 0),
    passiveTaxUsd: s.passive.reduce((a, p) => a + ilsToUsd(passiveTaxShareILS(p), avg), 0),
    passiveTaxILS: s.passive.reduce((a, p) => a + passiveTaxShareILS(p), 0),
  };
}

export interface EstimateResult {
  earnedUsd: number;
  passiveUsd: number;
  feieExcludedUsd: number;
  foreignTaxCreditUsd: number;
  taxableUsd: number;
  tentativeTaxUsd: number;
  ctcUsd: number; // nonrefundable CTC applied against tax
  refundableActcUsd: number;
  seTaxUsd: number;
  niitUsd: number; // 3.8% Net Investment Income Tax — NOT offset by the FTC
  estimatedOwedUsd: number; // negative = estimated refund
}

// NIIT (Form 8960) MAGI thresholds — fixed by statute, not inflation-indexed.
// ponytail: hard-coded; revisit only if Congress changes §1411.
const NIIT_THRESHOLD: Record<string, number> = {
  "Married filing jointly": 250_000,
  "Qualifying widow(er)": 250_000,
  "Married filing separately": 125_000,
  Single: 200_000,
  "Head of household": 200_000,
};

export function estimate(s: AppState): EstimateResult {
  const yd = yearData(s.taxYear);
  const avg = s.exchangeRateAvg;

  const salaryUsd = s.incomes.reduce((a, i) => a + ilsToUsd(i.grossAmountILS, avg), 0);
  const seNetIls = s.selfEmployment.reduce((a, e) => a + (e.grossILS - e.expensesILS), 0);
  const seNetUsd = Math.max(0, ilsToUsd(seNetIls, avg));
  const earnedUsd = salaryUsd + seNetUsd;
  // Joint passive income is reported at the taxpayer's 50% share.
  const passiveUsd = s.passive.reduce((a, p) => a + ilsToUsd(passiveShareILS(p), avg), 0);

  // FEIE: exclude earned income up to the per-person limit (single-earner assumption).
  const feieExcludedUsd =
    s.foreignIncomeMethod === "2555" ? Math.min(earnedUsd, yd.feieLimit) : 0;

  const stdDed = yd.stdDeduction[s.taxpayer.filingStatus];
  const taxableUsd = Math.max(0, earnedUsd + passiveUsd - feieExcludedUsd - stdDed);
  const tentativeTaxUsd = bracketTax(taxableUsd, yd.brackets[s.taxpayer.filingStatus]);

  // Foreign tax credit (method 1116): each category's credit is capped by the
  // Form 1116 Part III limitation (US tax × foreign-income ratio), then the total
  // is capped at US tax (Part IV). See ftc1116().
  const foreignTaxCreditUsd =
    s.foreignIncomeMethod === "1116"
      ? ftc1116(s, taxableUsd, tentativeTaxUsd).totalCreditUsd
      : 0;

  const taxAfterFtc = Math.max(0, tentativeTaxUsd - foreignTaxCreditUsd);

  // Child Tax Credit: qualifying child = under 17 at year-end with an SSN.
  const qualifyingChildren = s.dependents.filter(
    (d) => d.ssn.replace(/\D/g, "").length === 9 && s.taxYear - d.birthYear < 17
  ).length;
  const potentialCtc = qualifyingChildren * yd.ctcPerChild;
  const ctcUsd = Math.min(potentialCtc, taxAfterFtc);
  const refundableActcUsd = Math.min(
    potentialCtc - ctcUsd,
    qualifyingChildren * yd.ctcRefundableMax
  );

  // SE tax: no US–Israel totalization agreement, so 15.3% applies on net × 92.35%.
  const seTaxUsd = seNetUsd > 0 ? seNetUsd * 0.9235 * 0.153 : 0;

  // NIIT (Form 8960): 3.8% on the smaller of net investment income (passive) or
  // MAGI over the threshold. MAGI adds the FEIE exclusion back. Critically, the
  // foreign tax credit does NOT offset NIIT — it's added after taxAfterFtc.
  const magiUsd = earnedUsd + passiveUsd; // FEIE added back for NIIT
  const niitThreshold = NIIT_THRESHOLD[s.taxpayer.filingStatus] ?? 200_000;
  const niitUsd =
    passiveUsd > 0
      ? 0.038 * Math.min(passiveUsd, Math.max(0, magiUsd - niitThreshold))
      : 0;

  const estimatedOwedUsd =
    Math.max(0, taxAfterFtc - ctcUsd) + seTaxUsd + niitUsd - refundableActcUsd;

  return {
    earnedUsd,
    passiveUsd,
    feieExcludedUsd,
    foreignTaxCreditUsd,
    taxableUsd,
    tentativeTaxUsd,
    ctcUsd,
    refundableActcUsd,
    seTaxUsd,
    niitUsd,
    estimatedOwedUsd,
  };
}

// ponytail: assert-based self-check; run with `tsx src/utils/estimate.ts`.
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
      filingStatus: "Married filing jointly",
      phone: "",
      email: "",
      address: { street: "", city: "", zip: "", country: "Israel" },
    },
    incomes: [],
    passive: [],
    fbarAccounts: [],
    dependents: [],
    selfEmployment: [],
  };

  // $90k salary (≈310,590 ILS), FEIE → $0 owed.
  const feie = estimate({
    ...base,
    incomes: [{ id: "1", sourceName: "job", grossAmountILS: 90000 * 3.451, taxPaidILS: 0 }],
  });
  console.assert(feie.estimatedOwedUsd === 0, "FEIE on $90k MFJ should owe $0");

  // Method 1116, full Israeli tax wipes out US tax → $0.
  const ftc = estimate({
    ...base,
    foreignIncomeMethod: "1116",
    incomes: [{ id: "1", sourceName: "job", grossAmountILS: 200000 * 3.451, taxPaidILS: 60000 * 3.451 }],
  });
  console.assert(ftc.estimatedOwedUsd === 0, "FTC with heavy Israeli tax should owe $0");

  // 2 qualifying kids, no US tax → refundable ACTC up to 2×$1,700.
  const kids = estimate({
    ...base,
    dependents: [
      { id: "k1", name: "k1", ssn: "111111111", birthYear: 2020 },
      { id: "k2", name: "k2", ssn: "222222222", birthYear: 2022 },
    ],
    incomes: [{ id: "1", sourceName: "job", grossAmountILS: 90000 * 3.451, taxPaidILS: 0 }],
  });
  console.assert(
    Math.round(kids.refundableActcUsd) === 3400,
    `2 kids ACTC should be $3,400, got ${kids.refundableActcUsd}`
  );

  // Self-employed net $50k → SE tax ≈ $50k×0.9235×0.153 ≈ $7,065.
  const se = estimate({
    ...base,
    selfEmployment: [{ id: "s", businessName: "biz", grossILS: 50000 * 3.451, expensesILS: 0 }],
  });
  console.assert(
    Math.abs(se.seTaxUsd - 50000 * 0.9235 * 0.153) < 1,
    "SE tax ~15.3% of net×0.9235"
  );

  // NIIT: MFJ, $240k salary fully credited (1116) + $80k passive → MAGI $320k,
  // $70k over the $250k threshold; NIIT = 3.8% × min($80k, $70k) = $2,660.
  // Proves you owe US tax via NIIT even when the FTC zeroes income tax.
  const niit = estimate({
    ...base,
    foreignIncomeMethod: "1116",
    incomes: [{ id: "1", sourceName: "job", grossAmountILS: 240000 * 3.451, taxPaidILS: 120000 * 3.451 }],
    passive: [{ id: "p", kind: "dividends", sourceName: "ETF", amountILS: 80000 * 3.451, taxPaidILS: 0 }],
  });
  console.assert(
    Math.abs(niit.niitUsd - 0.038 * 70000) < 1,
    `NIIT should be 3.8%×$70k=$2,660, got ${niit.niitUsd}`
  );
  console.assert(niit.niitUsd > 0 && niit.estimatedOwedUsd > 0, "NIIT owed despite full FTC");

  // Joint passive interest is reported at 50%: $10k interest joint → $5k in passiveUsd.
  const joint = estimate({
    ...base,
    passive: [{ id: "p", kind: "interest", sourceName: "Bank", amountILS: 10000 * 3.451, taxPaidILS: 1500 * 3.451, isJoint: true }],
  });
  console.assert(Math.abs(joint.passiveUsd - 5000) < 1, `joint interest should be 50% ($5k), got ${joint.passiveUsd}`);

  // Form 1116 Part III limitation (the user's case): taxable $29,127, US tax $3,257.
  // Passive: $560 income → ratio 0.0192 → limit ~$63 < $84 paid → credit capped at $63.
  // General: wages ratio caps at 1 → limit = full tax $3,257 < $12,355 paid → credit $3,257.
  const lim = ftc1116(
    {
      ...base,
      foreignIncomeMethod: "1116",
      taxpayer: { ...base.taxpayer, filingStatus: "Married filing separately" },
      incomes: [{ id: "1", sourceName: "j", grossAmountILS: 105000 * 3.5, taxPaidILS: 12355 * 3.5 }],
      passive: [{ id: "p", kind: "interest", sourceName: "b", amountILS: 560 * 3.5 * 2, taxPaidILS: 84 * 3.5 * 2, isJoint: true }],
      exchangeRateAvg: 3.5,
    } as AppState,
    29127,
    3257
  );
  console.assert(Math.round(lim.passive.creditUsd) === 63, `passive credit limited to ~$63, got ${lim.passive.creditUsd}`);
  console.assert(Math.round(lim.general.creditUsd) === 3257, `general credit capped at US tax $3,257, got ${lim.general.creditUsd}`);
  console.assert(lim.totalCreditUsd <= 3257, "total FTC never exceeds US tax");

  console.log("estimate demo ok");
}

// ponytail: run only when executed directly under tsx (no @types/node needed).
const _argv = (globalThis as { process?: { argv?: string[] } }).process?.argv;
if (_argv && import.meta.url === `file://${_argv[1]}`) demo();
