// Per-tax-year constants and exchange rates, in one place.
// ponytail: a lookup table, not a tax engine. Values are official where cited;
// EOY (FBAR/Treasury) rates are convenience prefills — VERIFY before filing,
// and every rate stays editable in the UI (the calibration knob).

import type { FilingStatus } from "../types";

export interface Bracket {
  upTo: number; // taxable income up to this amount (Infinity for top)
  rate: number;
}

export interface YearData {
  feieLimit: number; // Form 2555 max exclusion per person
  stdDeduction: Record<FilingStatus, number>;
  brackets: Record<FilingStatus, Bracket[]>;
  ctcPerChild: number; // Child Tax Credit per qualifying child (<17, with SSN)
  ctcRefundableMax: number; // Additional CTC refundable cap per child
}

// 2025 federal schedules (filing in 2026).
// Sources: IRS Rev. Proc. 2024-40 / Tax Foundation 2025 brackets.
const SINGLE_2025: Bracket[] = [
  { upTo: 11_925, rate: 0.1 },
  { upTo: 48_475, rate: 0.12 },
  { upTo: 103_350, rate: 0.22 },
  { upTo: 197_300, rate: 0.24 },
  { upTo: 250_525, rate: 0.32 },
  { upTo: 626_350, rate: 0.35 },
  { upTo: Infinity, rate: 0.37 },
];
const MFJ_2025: Bracket[] = [
  { upTo: 23_850, rate: 0.1 },
  { upTo: 96_950, rate: 0.12 },
  { upTo: 206_700, rate: 0.22 },
  { upTo: 394_600, rate: 0.24 },
  { upTo: 501_050, rate: 0.32 },
  { upTo: 751_600, rate: 0.35 },
  { upTo: Infinity, rate: 0.37 },
];
const MFS_2025: Bracket[] = [
  { upTo: 11_925, rate: 0.1 },
  { upTo: 48_475, rate: 0.12 },
  { upTo: 103_350, rate: 0.22 },
  { upTo: 197_300, rate: 0.24 },
  { upTo: 250_525, rate: 0.32 },
  { upTo: 375_800, rate: 0.35 },
  { upTo: Infinity, rate: 0.37 },
];
const HOH_2025: Bracket[] = [
  { upTo: 17_000, rate: 0.1 },
  { upTo: 64_850, rate: 0.12 },
  { upTo: 103_350, rate: 0.22 },
  { upTo: 197_300, rate: 0.24 },
  { upTo: 250_500, rate: 0.32 },
  { upTo: 626_350, rate: 0.35 },
  { upTo: Infinity, rate: 0.37 },
];

const YEARS: Record<number, YearData> = {
  2025: {
    feieLimit: 130_000,
    stdDeduction: {
      Single: 15_750,
      "Married filing jointly": 31_500,
      "Married filing separately": 15_750,
      "Head of household": 23_625,
      "Qualifying widow(er)": 31_500,
    },
    brackets: {
      Single: SINGLE_2025,
      "Married filing jointly": MFJ_2025,
      "Married filing separately": MFS_2025,
      "Head of household": HOH_2025,
      "Qualifying widow(er)": MFJ_2025,
    },
    ctcPerChild: 2_000,
    ctcRefundableMax: 1_700,
  },
};

/** Falls back to the most recent year we have data for. */
export function yearData(taxYear: number): YearData {
  return YEARS[taxYear] ?? YEARS[2025];
}

// IRS yearly-average ILS per USD (avg) + Treasury Dec-31 ILS per USD (eoy, for FBAR).
// avg = official IRS table. eoy = Treasury year-end; 2025 eoy is an estimate — verify.
export const RATES: Record<number, { avg: number; eoy: number }> = {
  2022: { avg: 3.361, eoy: 3.519 },
  2023: { avg: 3.687, eoy: 3.627 },
  2024: { avg: 3.701, eoy: 3.647 },
  2025: { avg: 3.451, eoy: 3.300 },
};

/** Progressive tax on taxable income for a filing status. */
export function bracketTax(taxable: number, brackets: Bracket[]): number {
  if (taxable <= 0) return 0;
  let tax = 0;
  let prev = 0;
  for (const b of brackets) {
    const slice = Math.min(taxable, b.upTo) - prev;
    if (slice > 0) tax += slice * b.rate;
    if (taxable <= b.upTo) break;
    prev = b.upTo;
  }
  return tax;
}
