import { stringify } from "yaml";
import type { AppState } from "../types";
import { ilsToUsd } from "./currency";

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Build a config.yaml compatible with github.com/wickedest/irs-form-filler.
 * The tool uses Form 1116 (Foreign Tax Credit) — Form 2555 is not supported.
 * All ILS amounts stay in ILS; the tool converts using the supplied rates.
 */
export function buildConfigYaml(state: AppState): string {
  const { taxpayer, incomes, fbarAccounts, exchangeRateAvg, exchangeRateEOY, taxYear } = state;

  const totalGrossILS = round2(incomes.reduce((a, i) => a + i.grossAmountILS, 0));
  const totalTaxILS = round2(incomes.reduce((a, i) => a + i.taxPaidILS, 0));

  return stringify({
    firstName: taxpayer.firstName,
    middleInitial: "",
    lastName: taxpayer.lastName,
    ssn: taxpayer.ssn,
    occupation: taxpayer.occupation,
    phone: taxpayer.phone,
    email: taxpayer.email,
    address: {
      street: taxpayer.address.street,
      county: "",
      city: taxpayer.address.city,
      postCode: taxpayer.address.zip,
      countryCode: "IL",
      country: taxpayer.address.country || "Israel",
    },
    employer: {
      name: incomes.map((i) => i.sourceName).filter(Boolean).join(", ") || "",
      usaAddress: "",
      foreignAddress: "",
    },
    financial: {
      endOfTaxYear: `12/31/${taxYear}`,
      filingStatus: taxpayer.filingStatus,
      income: totalGrossILS,
      incomeTax: totalTaxILS,
      averageExchangeRate: exchangeRateAvg,
      averageExchangeRateSource:
        "https://www.irs.gov/individuals/international-taxpayers/yearly-average-currency-exchange-rates",
      treasuryExchangeRate: exchangeRateEOY,
      countriesWithBankAccounts: "Israel",
      haveVirtualCurrency: "no",
    },
    carryover: {
      general: {},
      "alternative-minimum-tax": {},
    },
    accounts: fbarAccounts.map((acc) => ({
      account: acc.accountNumber || acc.bankName,
      type: "deposit",
      name: acc.bankName,
      address: acc.bankAddress || "Israel",
      city: "",
      currency: "ILS",
      value: acc.maxBalanceILS,
      opened: false,
      closed: false,
      joint: acc.isJoint,
      tax: false,
    })),
  });
}

/** Map FBAR accounts to a standard CSV (balances converted at EOY rate). */
export function buildFbarCsv(state: AppState): string {
  const { fbarAccounts, exchangeRateEOY } = state;
  const headers = [
    "Bank Name",
    "Account Number",
    "Bank Address",
    "Max Balance ILS",
    "Max Balance USD",
    "Joint Account",
  ];
  const esc = (v: string | number) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = fbarAccounts.map((a) =>
    [
      a.bankName,
      a.accountNumber,
      a.bankAddress,
      round2(a.maxBalanceILS),
      round2(ilsToUsd(a.maxBalanceILS, exchangeRateEOY)),
      a.isJoint ? "Yes" : "No",
    ]
      .map(esc)
      .join(",")
  );
  return [headers.join(","), ...rows].join("\n");
}

/** Trigger a client-side file download (no server round-trip). */
export function downloadFile(
  filename: string,
  content: string,
  mime: string
): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
