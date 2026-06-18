import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import {
  UploadCloud,
  Loader2,
  Plus,
  Trash2,
  FileText,
  Briefcase,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { useStore } from "../store/useStore";
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

export function Step2Income() {
  const {
    incomes,
    addIncome,
    updateIncome,
    removeIncome,
    selfEmployment,
    addSe,
    updateSe,
    removeSe,
  } = useStore();
  const rate = useStore((s) => s.exchangeRateAvg);
  const { t } = useTranslation();
  const s = t.step2;

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
        setProgress(`${s.dropTitle.split(" ")[0]} ${file.name}…`);
        const result = await processDocument(file, (pct) =>
          setProgress(`OCR ${file.name}: ${pct}%`)
        );
        newLog.push({
          name: file.name,
          ok: result.type === DocumentType.FORM_106,
          detail:
            result.type === DocumentType.FORM_106
              ? `Detected ${result.label}.`
              : result.type === DocumentType.FORM_867
              ? "Looks like Form 867 — use the Passive income step."
              : result.type === DocumentType.BANK_FBAR
              ? "Looks like a bank balance — use the FBAR step."
              : "Could not classify — review manually.",
        });
        // This step only ingests Form 106; other types belong on their own step.
        if (result.type === DocumentType.FORM_106) {
          found.push({ result, fileName: file.name });
        }
      } catch (err) {
        newLog.push({
          name: file.name,
          ok: false,
          detail: `Failed to parse: ${(err as Error).message}`,
        });
      }
    }
    setQueue((q) => [...q, ...found]);
    setLog((l) => [...newLog, ...l]);
    setBusy(false);
    setProgress("");
  }, [s.dropTitle]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "image/*": [".png", ".jpg", ".jpeg", ".webp"],
    },
    disabled: busy,
  });

  const dispatchConfirmed = (
    fields: Record<string, number | string | boolean>,
    fileName: string
  ) => {
    // Only Form 106 is queued on this step (see onDrop).
    addIncome({
      sourceName: fileName,
      grossAmountILS: Number(fields.grossIncomeILS) || 0,
      taxPaidILS: Number(fields.taxWithheldILS) || 0,
    });
    setQueue((q) => q.slice(1));
  };

  const totalGross = incomes.reduce((a, i) => a + i.grossAmountILS, 0);
  const totalTax = incomes.reduce((a, i) => a + i.taxPaidILS, 0);
  const current = queue[0];

  return (
    <div className="space-y-4">
      {current && (
        <ExtractionConfirmModal
          result={current.result}
          fileName={current.fileName}
          onConfirm={(_type, fields) =>
            dispatchConfirmed(fields, current.fileName)
          }
          onCancel={() => setQueue((q) => q.slice(1))}
        />
      )}

      <div
        {...getRootProps()}
        className={`card flex cursor-pointer flex-col items-center justify-center border-2 border-dashed py-10 text-center transition ${
          isDragActive
            ? "border-brand-500 bg-brand-50"
            : "border-slate-300 hover:border-brand-400"
        }`}
      >
        <input {...getInputProps()} />
        {busy ? (
          <>
            <Loader2 className="mb-3 animate-spin text-brand-600" size={32} />
            <p className="text-sm font-medium text-slate-700">{progress}</p>
          </>
        ) : (
          <>
            <UploadCloud className="mb-3 text-brand-600" size={32} />
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
          <h3 className="flex items-center gap-2 text-base font-bold text-slate-900">
            <FileText size={18} /> {s.incomeTitle}
          </h3>
          <button className="btn-ghost" onClick={() => addIncome()}>
            <Plus size={16} /> {t.common.addRow}
          </button>
        </div>

        {incomes.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">{s.noIncome}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
                  <th className="py-2 pr-3">{t.common.source}</th>
                  <th className="py-2 pr-3">{s.grossILS}</th>
                  <th className="py-2 pr-3">{s.taxILS}</th>
                  <th className="py-2 pr-3">{s.grossUSD}</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {incomes.map((rec) => (
                  <tr key={rec.id} className="border-b border-slate-100">
                    <td className="py-2 pr-3">
                      <input
                        className="input"
                        value={rec.sourceName}
                        placeholder={s.employerPlaceholder}
                        onChange={(e) =>
                          updateIncome(rec.id, { sourceName: e.target.value })
                        }
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        type="number"
                        className="input w-32"
                        value={rec.grossAmountILS}
                        onChange={(e) =>
                          updateIncome(rec.id, {
                            grossAmountILS: Number(e.target.value) || 0,
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
                          updateIncome(rec.id, {
                            taxPaidILS: Number(e.target.value) || 0,
                          })
                        }
                      />
                    </td>
                    <td className="py-2 pr-3 font-medium text-slate-600">
                      {usd(ilsToUsd(rec.grossAmountILS, rate))}
                    </td>
                    <td className="py-2">
                      <button
                        className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500"
                        onClick={() => removeIncome(rec.id)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="text-sm font-bold text-slate-800">
                  <td className="py-3">{t.common.totals}</td>
                  <td className="py-3 pr-3">{totalGross.toLocaleString()} ₪</td>
                  <td className="py-3 pr-3">{totalTax.toLocaleString()} ₪</td>
                  <td className="py-3 pr-3">{usd(ilsToUsd(totalGross, rate))}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-base font-bold text-slate-900">
              <Briefcase size={18} /> {s.seTitle}
            </h3>
            <p className="text-xs text-slate-400">{s.seSub}</p>
          </div>
          <button className="btn-ghost" onClick={() => addSe()}>
            <Plus size={16} /> {s.addSe}
          </button>
        </div>

        {selfEmployment.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-400">{s.noSe}</p>
        ) : (
          <div className="space-y-3">
            {selfEmployment.map((e) => (
              <div
                key={e.id}
                className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-[1fr_140px_140px_120px_auto]"
              >
                <div>
                  <label className="label">{s.seName}</label>
                  <input
                    className="input"
                    value={e.businessName}
                    onChange={(ev) => updateSe(e.id, { businessName: ev.target.value })}
                  />
                </div>
                <div>
                  <label className="label">{s.seGross}</label>
                  <input
                    type="number"
                    className="input"
                    value={e.grossILS}
                    onChange={(ev) =>
                      updateSe(e.id, { grossILS: Number(ev.target.value) || 0 })
                    }
                  />
                </div>
                <div>
                  <label className="label">{s.seExpenses}</label>
                  <input
                    type="number"
                    className="input"
                    value={e.expensesILS}
                    onChange={(ev) =>
                      updateSe(e.id, { expensesILS: Number(ev.target.value) || 0 })
                    }
                  />
                </div>
                <div>
                  <label className="label">{s.seNet}</label>
                  <input
                    className="input bg-slate-100 text-slate-500"
                    value={usd(ilsToUsd(e.grossILS - e.expensesILS, rate))}
                    disabled
                  />
                </div>
                <div className="flex items-end">
                  <button
                    className="rounded p-2 text-slate-400 hover:bg-red-50 hover:text-red-500"
                    onClick={() => removeSe(e.id)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
