/** Convert ILS to USD given a USD/ILS rate (ILS per 1 USD). */
export function ilsToUsd(amountILS: number, rate: number): number {
  if (!rate || rate <= 0) return 0;
  return amountILS / rate;
}

export const usd = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);

export const ils = (n: number) =>
  new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);
