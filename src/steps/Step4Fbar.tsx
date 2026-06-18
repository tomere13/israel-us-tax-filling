import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import {
  Plus,
  Trash2,
  Landmark,
  ShieldAlert,
  ShieldCheck,
  UploadCloud,
  Loader2,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { useStore } from "../store/useStore";
import { ilsToUsd, usd } from "../utils/currency";
import { useTranslation, inter } from "../i18n";
import {
  processDocument,
  DocumentType,
  type ExtractionResult,
} from "../services/DocumentExtractionService";
import { ExtractionConfirmModal } from "../components/ExtractionConfirmModal";

const FBAR_THRESHOLD_USD = 10_000;

interface LogEntry { name: string; ok: boolean; detail: string }
interface QueueItem { result: ExtractionResult; fileName: string }

export function Step4Fbar() {
  const { fbarAccounts, addFbar, updateFbar, removeFbar } = useStore();
  const rate = useStore((s) => s.exchangeRateEOY);
  const { t } = useTranslation();
  const s = t.step4;

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
          ok: result.type === DocumentType.BANK_FBAR,
          detail:
            result.type === DocumentType.BANK_FBAR
              ? `Detected ${result.label}.`
              : result.type === DocumentType.UNKNOWN
              ? "Could not classify — review manually."
              : `Detected ${result.label} — use Step 2 for this file.`,
        });
        if (result.type === DocumentType.BANK_FBAR) {
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
    _type: DocumentType,
    fields: Record<string, number | string | boolean>,
    fileName: string
  ) => {
    addFbar({
      bankName: String(fields.bankName || fileName),
      accountNumber: String(fields.accountNumber || ""),
      maxBalanceILS: Number(fields.maxBalanceILS) || 0,
      isJoint: Boolean(fields.isJoint),
    });
    setQueue((q) => q.slice(1));
  };

  const totalUsd = fbarAccounts.reduce(
    (a, acc) => a + ilsToUsd(acc.maxBalanceILS, rate),
    0
  );
  const required = totalUsd > FBAR_THRESHOLD_USD;

  return (
    <div className="space-y-4">
      {current && (
        <ExtractionConfirmModal
          result={current.result}
          fileName={current.fileName}
          onConfirm={(type, fields) => dispatchConfirmed(type, fields, current.fileName)}
          onCancel={() => setQueue((q) => q.slice(1))}
        />
      )}

      {/* PDF drop zone */}
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

      {/* Sticky threshold banner */}
      <div className="sticky top-0 z-10 -mx-1">
        <div
          className={`flex items-center justify-between rounded-xl border px-5 py-4 shadow-sm ${
            required
              ? "border-emerald-200 bg-emerald-50"
              : "border-slate-200 bg-slate-50"
          }`}
        >
          <div className="flex items-center gap-3">
            {required ? (
              <ShieldAlert className="text-emerald-600" size={22} />
            ) : (
              <ShieldCheck className="text-slate-400" size={22} />
            )}
            <div>
              <p className="text-sm font-semibold text-slate-800">
                {s.aggregate} {usd(totalUsd)}
              </p>
              <p className="text-xs text-slate-500">
                {inter(s.eoyNote, { rate })} {usd(FBAR_THRESHOLD_USD)}
              </p>
            </div>
          </div>
          <span
            className={`rounded-full px-3 py-1.5 text-xs font-bold ${
              required
                ? "bg-emerald-500 text-white"
                : "bg-slate-300 text-slate-700"
            }`}
          >
            {required ? s.fbarRequired : s.fbarNotRequired}
          </span>
        </div>
      </div>

      <div className="card">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-base font-bold text-slate-900">
              <Landmark size={18} /> {s.accountsTitle}
            </h3>
            <p className="text-xs text-slate-400">{s.accountsSubtitle}</p>
          </div>
          <button className="btn-ghost" onClick={() => addFbar()}>
            <Plus size={16} /> {t.common.addAccount}
          </button>
        </div>

        {fbarAccounts.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">{s.noAccounts}</p>
        ) : (
          <div className="space-y-4">
            {fbarAccounts.map((acc) => (
              <div
                key={acc.id}
                className="rounded-lg border border-slate-200 p-4"
              >
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label">{s.bankName}</label>
                    <input
                      className="input"
                      value={acc.bankName}
                      onChange={(e) =>
                        updateFbar(acc.id, { bankName: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className="label">{s.accountNumber}</label>
                    <input
                      className="input"
                      value={acc.accountNumber}
                      onChange={(e) =>
                        updateFbar(acc.id, { accountNumber: e.target.value })
                      }
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="label">{s.bankAddress}</label>
                    <input
                      className="input"
                      value={acc.bankAddress}
                      onChange={(e) =>
                        updateFbar(acc.id, { bankAddress: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className="label">{s.maxILS}</label>
                    <input
                      type="number"
                      className="input"
                      value={acc.maxBalanceILS}
                      onChange={(e) =>
                        updateFbar(acc.id, {
                          maxBalanceILS: Number(e.target.value) || 0,
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="label">{s.maxUSD}</label>
                    <input
                      className="input bg-slate-100 text-slate-500"
                      value={usd(ilsToUsd(acc.maxBalanceILS, rate))}
                      disabled
                    />
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <label className="flex items-center gap-2 text-sm text-slate-600">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300"
                      checked={acc.isJoint}
                      onChange={(e) =>
                        updateFbar(acc.id, { isJoint: e.target.checked })
                      }
                    />
                    {s.joint}
                  </label>
                  <button
                    className="flex items-center gap-1.5 rounded p-1.5 text-sm text-slate-400 hover:bg-red-50 hover:text-red-500"
                    onClick={() => removeFbar(acc.id)}
                  >
                    <Trash2 size={16} /> {t.common.remove}
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
