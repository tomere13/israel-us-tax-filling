import { useEffect, useState } from "react";
import { X, CheckCircle2, AlertTriangle, FileCheck } from "lucide-react";
import {
  DocumentType,
  type ExtractionResult,
  type Form106Data,
  type Form867Data,
  type FbarData,
} from "../services/DocumentExtractionService";
import { ilsToUsd, usd } from "../utils/currency";
import { useStore } from "../store/useStore";

type Editable = Record<string, number | string | boolean>;

function initialFields(r: ExtractionResult): Editable {
  switch (r.type) {
    case DocumentType.FORM_106: {
      const d = r.data as Form106Data;
      return { grossIncomeILS: d.grossIncomeILS, taxWithheldILS: d.taxWithheldILS };
    }
    case DocumentType.FORM_867: {
      const d = r.data as Form867Data;
      return {
        interestILS: d.interestILS,
        ordinaryDividendsILS: d.ordinaryDividendsILS,
        netCapitalGainsILS: d.netCapitalGainsILS,
        taxWithheldILS: d.taxWithheldILS,
      };
    }
    case DocumentType.BANK_FBAR: {
      const d = r.data as FbarData;
      return {
        bankName: d.bankName,
        accountNumber: d.accountNumber,
        maxBalanceILS: d.maxBalanceILS,
        isJoint: d.isJoint,
      };
    }
    default:
      return {};
  }
}

const FIELD_LABELS: Record<string, string> = {
  grossIncomeILS: "Gross income (₪)",
  taxWithheldILS: "Income tax withheld (₪)",
  interestILS: "Interest (₪)",
  ordinaryDividendsILS: "Ordinary dividends (₪)",
  netCapitalGainsILS: "Net capital gains (₪)",
  bankName: "Bank name",
  accountNumber: "Account number",
  maxBalanceILS: "Maximum balance during year (₪)",
  isJoint: "Joint account",
};

const MONEY_FIELDS = new Set([
  "grossIncomeILS",
  "taxWithheldILS",
  "interestILS",
  "ordinaryDividendsILS",
  "netCapitalGainsILS",
  "maxBalanceILS",
]);

const BOOL_FIELDS = new Set(["isJoint"]);

export function ExtractionConfirmModal({
  result,
  fileName,
  onConfirm,
  onCancel,
}: {
  result: ExtractionResult;
  fileName: string;
  onConfirm: (type: DocumentType, fields: Editable) => void;
  onCancel: () => void;
}) {
  const [fields, setFields] = useState<Editable>(() => initialFields(result));
  // FBAR balances convert at the EOY rate; income at the average rate.
  const rate = useStoreRate(result.type);

  useEffect(() => setFields(initialFields(result)), [result]);

  const unknown = result.type === DocumentType.UNKNOWN;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-3">
            {unknown ? (
              <AlertTriangle className="text-amber-500" size={22} />
            ) : (
              <FileCheck className="text-brand-600" size={22} />
            )}
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {unknown
                  ? "Couldn't identify this document"
                  : `We detected: ${result.label}`}
              </h3>
              <p className="text-xs text-slate-400">{fileName}</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="rounded p-1 text-slate-400 hover:bg-slate-100"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          {unknown ? (
            <p className="text-sm text-slate-600">
              We extracted the text but couldn't match it to Form 106, Form 867,
              or a bank balance statement. You can still add the values manually
              on the relevant step.
            </p>
          ) : (
            <>
              <p className="text-sm text-slate-600">
                Please verify or edit these values before adding them to your
                totals.
              </p>
              <div className="space-y-3">
                {Object.entries(fields).map(([key, value]) => {
                  const isMoney = MONEY_FIELDS.has(key);
                  const isBool = BOOL_FIELDS.has(key);
                  if (isBool) {
                    return (
                      <label key={key} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300"
                          checked={Boolean(value)}
                          onChange={(e) =>
                            setFields((f) => ({ ...f, [key]: e.target.checked }))
                          }
                        />
                        {FIELD_LABELS[key] ?? key}
                      </label>
                    );
                  }
                  return (
                    <div key={key}>
                      <label className="label">
                        {FIELD_LABELS[key] ?? key}
                      </label>
                      <div className="flex items-center gap-3">
                        <input
                          className="input"
                          type={isMoney ? "number" : "text"}
                          value={value as number | string}
                          onChange={(e) =>
                            setFields((f) => ({
                              ...f,
                              [key]: isMoney
                                ? Number(e.target.value) || 0
                                : e.target.value,
                            }))
                          }
                        />
                        {isMoney && (
                          <span className="w-28 shrink-0 text-right text-sm font-medium text-emerald-600">
                            {usd(ilsToUsd(Number(value) || 0, rate))}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">
                USD shown at {rate} ILS/USD (
                {result.type === DocumentType.BANK_FBAR ? "EOY" : "average"}{" "}
                rate from your profile).
              </p>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-6 py-4">
          <button className="btn-ghost" onClick={onCancel}>
            {unknown ? "Close" : "Discard"}
          </button>
          {!unknown && (
            <button
              className="btn-primary"
              onClick={() => onConfirm(result.type, fields)}
            >
              <CheckCircle2 size={16} /> Add to totals
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Small hook to pick the correct rate for the preview.
function useStoreRate(type: DocumentType): number {
  const avg = useStore((s) => s.exchangeRateAvg);
  const eoy = useStore((s) => s.exchangeRateEOY);
  return type === DocumentType.BANK_FBAR ? eoy : avg;
}
