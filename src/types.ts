// Core data schema for the US Expat Tax Filer (TY2025).
// Everything is stored locally in the browser only.

export type FilingStatus =
  | 'Single'
  | 'Married filing jointly'
  | 'Married filing separately'
  | 'Head of household'
  | 'Qualifying widow(er)';

export interface Taxpayer {
  firstName: string;
  lastName: string;
  ssn: string; // Stored locally only — never transmitted.
  occupation: string;
  filingStatus: FilingStatus;
  phone: string;
  email: string;
  address: {
    street: string;
    city: string;
    zip: string;
    country: string;
  };
}

export interface IncomeRecord {
  id: string;
  sourceName: string;
  grossAmountILS: number;
  taxPaidILS: number;
}

/** Passive income: bank interest, capital gains, dividends. */
export type PassiveKind = "interest" | "capital_gains" | "dividends";

export interface PassiveRecord {
  id: string;
  kind: PassiveKind;
  sourceName: string;
  amountILS: number;
  taxPaidILS: number;
}

export interface FbarAccount {
  id: string;
  bankName: string;
  accountNumber: string;
  bankAddress: string;
  maxBalanceILS: number;
  isJoint: boolean;
}

/** A dependent — drives Child Tax Credit / Schedule 8812. */
export interface Dependent {
  id: string;
  name: string;
  ssn: string;          // SSN required for CTC (ITIN does not qualify)
  birthYear: number;    // under 17 at year-end → qualifying child for CTC
}

/** Israeli self-employed (עצמאי) business — drives Schedule C + SE tax. */
export interface SeRecord {
  id: string;
  businessName: string;
  grossILS: number;
  expensesILS: number;
}

/** Which foreign-income mechanism the export should target. */
export type ForeignIncomeMethod = "2555" | "1116";

export interface FilingSnapshot {
  id: string;
  savedAt: string;  // ISO timestamp
  label: string;
  data: AppState;
}

export interface AppState {
  taxYear: number;
  exchangeRateAvg: number; // For income (e.g., ~3.75 ILS per USD)
  exchangeRateEOY: number; // For FBAR (End-of-year rate)
  foreignIncomeMethod: ForeignIncomeMethod;
  taxpayer: Taxpayer;
  incomes: IncomeRecord[];
  passive: PassiveRecord[];
  fbarAccounts: FbarAccount[];
  dependents: Dependent[];
  selfEmployment: SeRecord[];
}
