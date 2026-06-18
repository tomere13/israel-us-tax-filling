// AcroForm field tokens for the genuine 2025 IRS PDFs (public/forms/2025/*.pdf).
// Each value is the field's *terminal token* (last dotted component of the fully
// qualified name); fillForms.ts resolves it to the full name. Terminal tokens are
// unique per PDF for every text field we touch (verified), so this stays robust
// even where IRS nests a box under a table/sub-container.
//
// Derived by position↔label correlation against the IRS blanks and confirmed by
// the sentinel round-trip in fillForms.ts demo().
// ponytail: IRS gives no stable field IDs/tooltips, so this is per-year by hand.
// Add 2026 = drop blanks in public/forms/2026/ + a sibling const; demo() flags any
// wrong token immediately.

// Form 1040 (2025).
export const F1040 = {
  firstNameMI: "f1_14[0]",
  lastName: "f1_15[0]",
  ssn: "f1_16[0]",
  spouseFirstMI: "f1_17[0]",
  spouseLast: "f1_18[0]",
  spouseSsn: "f1_19[0]",
  address: "f1_20[0]",
  apt: "f1_21[0]",
  city: "f1_22[0]",
  state: "f1_23[0]",
  zip: "f1_24[0]",
  foreignCountry: "f1_25[0]",
  foreignPostal: "f1_27[0]",
  line1aWages: "f1_47[0]", // 1a wages from W-2 box 1
  line1zWages: "f1_57[0]", // 1z total wages
  line9TotalIncome: "f1_73[0]",
  line11Agi: "f1_75[0]",
  line12StdDeduction: "f2_02[0]",
  line15Taxable: "f2_06[0]",
  line16Tax: "f2_08[0]",
  line20Sched3: "f2_12[0]", // FTC flows here (via Schedule 3 line 8)
  line22: "f2_14[0]",
  line24TotalTax: "f2_16[0]",
  line34Refund: "f2_30[0]",
  line37Owe: "f2_35[0]",
} as const;

// Filing status: pdf-lib exposes the c1_8 group as 5 separate checkboxes whose
// terminal tokens collide, so map each status to its FULL field name and .check() it.
export const FILING_STATUS_1040_FIELD: Record<string, string> = {
  Single: "topmostSubform[0].Page1[0].Checkbox_ReadOrder[0].c1_8[0]",
  "Married filing jointly": "topmostSubform[0].Page1[0].Checkbox_ReadOrder[0].c1_8[1]",
  "Married filing separately": "topmostSubform[0].Page1[0].Checkbox_ReadOrder[0].c1_8[2]",
  "Head of household": "topmostSubform[0].Page1[0].c1_8[0]",
  "Qualifying widow(er)": "topmostSubform[0].Page1[0].c1_8[1]",
};

// Form 1116 (2025) — Foreign Tax Credit. Single-category draft.
export const F1116 = {
  name: "f1_01[0]",
  ssn: "f1_02[0]",
  residentCountry: "f1_03[0]",
  line1aGrossIncomeColA: "f1_10[0]", // column A gross foreign income
  line7NetForeignIncome: "f1_51[0]",
  line14TotalForeignTax: "f2_06[0]",
  line20TaxAgainstCredit: "f2_12[0]", // 1040 tax (limit base)
  line24CategoryCredit: "f2_16[0]", // smaller of line 14 or 23
  line35CreditToSched3: "f2_27[0]",
} as const;

// Form 2555 (2025) — Foreign Earned Income Exclusion.
export const F2555 = {
  name: "f1_1[0]",
  ssn: "f1_2[0]",
  citizenCountry: "f1_11[0]",
  line19Wages: "f2_28[0]",
  line24TotalForeignEarned: "f2_51[0]",
  line26ForeignEarned: "f2_53[0]",
  line37MaxExclusion: "f3_13[0]",
  line42Exclusion: "f3_19[0]",
} as const;
