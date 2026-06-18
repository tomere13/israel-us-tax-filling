import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import {
  Plus,
  Trash2,
  PiggyBank,
  UploadCloud,
  Loader2,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { useStore } from "../store/useStore";
import type { PassiveKind } from "../types";
import { ilsToUsd, usd } from "../utils/currency";
import {
  processDocument,
  DocumentType,
  type ExtractionResult,
} from "../services/DocumentExtractionService";
import { ExtractionConfirmModal } from "../components/ExtractionConfirmModal";
import { useTranslation } from "../i18n";

interface LogEntry { name: string; ok: boolean; detail: string }
interface QueueItem { result: ExtractionResult; fileName: string }

export function Step3Passive() {
  const { passive, addPassive, updatePassive, removePassive } = useStore();
  const rate = useStore((s) => s.exchangeRateAvg);
  const { t } = useTranslation();
  const s = t.step3;

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [log, setLog] = useState<LogEntry[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);

  const onDrop = useCallback(async (files: File[]) => {
    setBusy(true);
    const found: QueueItem[] = [];
    const newLog: LogEntry[] = [];
    for (const file of files) {
      try {
        setProgress(`${file.name}…`);
        const result = await processDocument(file, (pct) =>
          setProgress(`OCR ${file.name}: ${pct}%`)
        );
        newLog.push({
          name: file.name,
          ok: result.type === DocumentType.FORM_867,
          detail:
            result.type === DocumentType.FORM_867
              ? `Detected ${result.label}.`
              : result.type === DocumentType.FORM_106
              ? "Looks like Form 106 — use the Income step."
              : result.type === DocumentType.BANK_FBAR
              ? "Looks like a bank balance — use the FBAR step."
              : "Could not classify — review manually.",
        });
        if (result.type === DocumentType.FORM_867) {
          found.push({ result, fileName: file.name });
        }
      } catch (err) {
        newLog.push({
          name: file.name,
          ok: false,
          detail: `Failed: ${(err as Error).message}`,
        });
      }
    }
    setQueue((q) => [...q, ...found]);
    setLog((l) => [...newLog, ...l]);
    setBusy(false);
    setProgress("");
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"], "image/*": [".png", ".jpg", ".jpeg", ".webp"] },
    disabled: busy,
  });

  const current = queue[0];
  const dispatchConfirmed = (
    fields: Record<string, number | string | boolean>,
    fileName: string
  ) => {
    const interest = Number(fields.interestILS) || 0;
    const dividends = Number(fields.ordinaryDividendsILS) || 0;
    const gains = Number(fields.netCapitalGainsILS) || 0;
    const isJoint = Boolean(fields.isJoint); // joint account → 50% share reported

    // Assign the withheld tax (field 043) to the first record so it isn't
    // double-counted across categories — it feeds the Foreign Tax Credit.
    let tax = Number(fields.taxWithheldILS) || 0;
    const takeTax = () => {
      const v = tax;
      tax = 0;
      return v;
    };
    if (interest)
      addPassive({ kind: "interest", sourceName: fileName, amountILS: interest, taxPaidILS: takeTax(), isJoint });
    if (dividends)
      addPassive({ kind: "dividends", sourceName: fileName, amountILS: dividends, taxPaidILS: takeTax(), isJoint });
    if (gains)
      addPassive({ kind: "capital_gains", sourceName: fileName, amountILS: gains, taxPaidILS: takeTax(), isJoint });
    setQueue((q) => q.slice(1));
  };

  const totalAmount = passive.reduce((a, p) => a + p.amountILS, 0);
  const totalTax = passive.reduce((a, p) => a + p.taxPaidILS, 0);

  return (
    <div className="space-y-4">
      {current && (
        <ExtractionConfirmModal
          result={current.result}
          fileName={current.fileName}
          onConfirm={(_type, fields) => dispatchConfirmed(fields, current.fileName)}
          onCancel={() => setQueue((q) => q.slice(1))}
        />
      )}

      {/* Form 867 drop zone */}
      <div
        {...getRootProps()}
        className={`card flex cursor-pointer flex-col items-center justify-center border-2 border-dashed py-8 text-center transition ${
          isDragActive ? "border-brand-500 bg-brand-50" : "border-slate-300 hover:border-brand-400"
        }`}
      >
        <input {...getInputProps()} />
        {busy ? (
          <>
            <Loader2 className="mb-3 animate-spin text-brand-600" size={28} />
            <p className="text-sm font-medium text-slate-700">{progress}</p>
          </>
        ) : (
          <>
            <UploadCloud className="mb-3 text-brand-600" size={28} />
            <p className="text-sm font-semibold text-slate-800">{s.dropTitle}</p>
            <p className="text-xs text-slate-400">{s.dropSub}</p>
          </>
        )}
      </div>

      {log.length > 0 && (
        <div className="card space-y-2">
          <h3 className="text-sm font-bold text-slate-900">{s.docLog}</h3>
          {log.map((e, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              {e.ok ? (
                <CheckCircle2 size={14} className="mt-0.5 text-emerald-500" />
              ) : (
                <AlertTriangle size={14} className="mt-0.5 text-amber-500" />
              )}
              <span className="font-medium text-slate-700">{e.name}</span>
              <span className="text-slate-400">— {e.detail}</span>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-base font-bold text-slate-900">
              <PiggyBank size={18} /> {s.title}
            </h3>
            <p className="text-xs text-slate-400">{s.subtitle}</p>
          </div>
          <button className="btn-ghost" onClick={() => addPassive()}>
            <Plus size={16} /> {t.common.addRow}
          </button>
        </div>

        {passive.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">{s.noPassive}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
                  <th className="py-2 pr-3">{s.kindLabel}</th>
                  <th className="py-2 pr-3">{t.common.source}</th>
                  <th className="py-2 pr-3">{t.common.amountILS}</th>
                  <th className="py-2 pr-3">{t.common.taxPaidILS}</th>
                  <th className="py-2 pr-3">{t.common.amountUSD}</th>
                  <th className="py-2 pr-3">{s.jointLabel}</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {passive.map((rec) => (
                  <tr key={rec.id} className="border-b border-slate-100">
                    <td className="py-2 pr-3">
                      <select
                        className="input"
                        value={rec.kind}
                        onChange={(e) =>
                          updatePassive(rec.id, {
                            kind: e.target.value as PassiveKind,
                          })
                        }
                      >
                        {(Object.keys(s.kinds) as PassiveKind[]).map((k) => (
                          <option key={k} value={k}>
                            {s.kinds[k]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        className="input"
                        placeholder={s.bankPlaceholder}
                        value={rec.sourceName}
                        onChange={(e) =>
                          updatePassive(rec.id, { sourceName: e.target.value })
                        }
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        type="number"
                        className="input w-32"
                        value={rec.amountILS}
                        onChange={(e) =>
                          updatePassive(rec.id, {
                            amountILS: Number(e.target.value) || 0,
                          })
                        }
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        type="number"
                        className="input w-32"
                        value={rec.taxPaidILS}
                        onChange={(e) =>
                          updatePassive(rec.id, {
                            taxPaidILS: Number(e.target.value) || 0,
                          })
                        }
                      />
                    </td>
                    <td className="py-2 pr-3 font-medium text-slate-600">
                      {usd(ilsToUsd(rec.amountILS, rate))}
                    </td>
                    <td className="py-2 pr-3 text-center">
                      <input
                        type="checkbox"
                        title={s.jointHint}
                        checked={!!rec.isJoint}
                        onChange={(e) =>
                          updatePassive(rec.id, { isJoint: e.target.checked })
                        }
                      />
                    </td>
                    <td className="py-2">
                      <button
                        className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500"
                        onClick={() => removePassive(rec.id)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="text-sm font-bold text-slate-800">
                  <td className="py-3" colSpan={2}>{t.common.totals}</td>
                  <td className="py-3 pr-3">{totalAmount.toLocaleString()} ₪</td>
                  <td className="py-3 pr-3">{totalTax.toLocaleString()} ₪</td>
                  <td className="py-3 pr-3">{usd(ilsToUsd(totalAmount, rate))}</td>
                  <td></td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
