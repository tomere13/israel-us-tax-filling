import { useMemo, useRef, useState } from "react";
import {
  Download,
  FileCode2,
  FileSpreadsheet,
  Eye,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  Calculator,
  CalendarClock,
  Printer,
  Upload,
  FileDown,
  Save,
  History,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useStore } from "../store/useStore";
import type { BackupPayload } from "../store/useStore";
import { ilsToUsd, usd } from "../utils/currency";
import { buildConfigYaml, buildFbarCsv, downloadFile } from "../utils/export";
import { generateForms } from "../utils/fillForms";
import { validate } from "../utils/validate";
import { requiredForms, deadlines } from "../utils/forms";
import { estimate } from "../utils/estimate";
import { useTranslation, inter } from "../i18n";

export function Step5Export() {
  const incomes = useStore((s) => s.incomes);
  const passive = useStore((s) => s.passive);
  const fbarAccounts = useStore((s) => s.fbarAccounts);
  const exchangeRateAvg = useStore((s) => s.exchangeRateAvg);
  const exchangeRateEOY = useStore((s) => s.exchangeRateEOY);
  const taxYear = useStore((s) => s.taxYear);
  const taxpayer = useStore((s) => s.taxpayer);
  const foreignIncomeMethod = useStore((s) => s.foreignIncomeMethod);
  const setForeignIncomeMethod = useStore((s) => s.setForeignIncomeMethod);
  const filingSnapshots = useStore((s) => s.filingSnapshots);
  const saveSnapshot = useStore((s) => s.saveSnapshot);
  const loadSnapshot = useStore((s) => s.loadSnapshot);
  const deleteSnapshot = useStore((s) => s.deleteSnapshot);
  const exportBackup = useStore((s) => s.exportBackup);
  const importBackup = useStore((s) => s.importBackup);
  const state = useStore();

  const { t } = useTranslation();
  const s = t.step5;
  const r = t.review;

  const issues = validate(state);
  const forms = requiredForms(state);
  const est = estimate(state);
  const dl = deadlines(taxYear);

  // Recommend the method with the lower estimated bill; tie → 1116 (keeps ACTC).
  const owed2555 = estimate({ ...state, foreignIncomeMethod: "2555" }).estimatedOwedUsd;
  const owed1116 = estimate({ ...state, foreignIncomeMethod: "1116" }).estimatedOwedUsd;
  const recMethod = owed1116 <= owed2555 ? "1116" : "2555";

  const fileInput = useRef<HTMLInputElement>(null);
  const onImportFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const payload = JSON.parse(String(reader.result)) as BackupPayload;
        if (payload.version !== 1 || !payload.state) throw new Error("bad");
        if (window.confirm(r.backupConfirm)) importBackup(payload);
      } catch {
        window.alert(r.backupBad);
      }
    };
    reader.readAsText(file);
  };

  const yaml = useMemo(
    () => buildConfigYaml(state),
    // ponytail: granular deps so memo only busts on relevant data changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [incomes, passive, fbarAccounts, exchangeRateAvg, exchangeRateEOY, taxYear, taxpayer]
  );
  const csv = useMemo(
    () => buildFbarCsv(state),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fbarAccounts, exchangeRateEOY]
  );

  const grossUsd = incomes.reduce(
    (a, i) => a + ilsToUsd(i.grossAmountILS, exchangeRateAvg),
    0
  );
  const passiveUsd = passive.reduce(
    (a, p) => a + ilsToUsd(p.amountILS, exchangeRateAvg),
    0
  );
  const fbarUsd = fbarAccounts.reduce(
    (a, acc) => a + ilsToUsd(acc.maxBalanceILS, exchangeRateEOY),
    0
  );

  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setGenerating(true);
    setGenError(null);
    try {
      // Fill the genuine 2025 IRS PDFs in-browser (no backend). One file per form.
      const generated = await generateForms(state);
      for (const f of generated) {
        const blob = new Blob([f.bytes as BlobPart], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = f.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      setGenError((err as Error).message);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <>
    <div className="space-y-4 no-print">
      {/* Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat
          label={s.earnedLabel}
          value={usd(grossUsd)}
          sub={inter(s.sources, { n: incomes.length })}
        />
        <Stat
          label={s.passiveLabel}
          value={usd(passiveUsd)}
          sub={inter(s.records, { n: passive.length })}
        />
        <Stat
          label={s.fbarLabel}
          value={usd(fbarUsd)}
          sub={inter(s.accounts, { n: fbarAccounts.length })}
        />
      </div>

      {/* Review & checklist */}
      <div className="card space-y-4">
        <h3 className="flex items-center gap-2 text-base font-bold text-slate-900">
          <ClipboardList size={18} /> {r.title}
        </h3>

        {issues.length === 0 ? (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">
            <CheckCircle2 size={16} className="shrink-0" /> {r.allClear}
          </div>
        ) : (
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
              {r.issuesTitle}
            </p>
            <ul className="space-y-1.5">
              {issues.map((i, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm">
                  <AlertCircle
                    size={14}
                    className={`mt-0.5 shrink-0 ${
                      i.severity === "error" ? "text-red-500" : "text-amber-500"
                    }`}
                  />
                  <span className="text-slate-600">{r.issues[i.key as keyof typeof r.issues]}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
            {r.formsTitle}
          </p>
          <ul className="space-y-1.5">
            {forms.map((f) => (
              <li key={f.form} className="flex items-start gap-2 text-sm">
                <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-brand-500" />
                <span className="text-slate-700">
                  <span className="font-semibold">{f.form}</span>{" "}
                  <span className="text-slate-500">
                    — {r.forms[f.key as keyof typeof r.forms]}
                  </span>{" "}
                  <span
                    className={`ml-1 rounded px-1.5 py-0.5 text-xs ${
                      f.generated
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {f.generated ? r.generatedTag : r.manualTag}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-lg bg-slate-50 p-3 text-sm">
          <p className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-400">
            <CalendarClock size={13} /> {r.deadlineTitle}
          </p>
          <div className="grid grid-cols-1 gap-1 text-slate-600 sm:grid-cols-3">
            <span>{r.deadlineAbroad}: <b>{dl.abroad}</b></span>
            <span>{r.deadlineExtended}: <b>{dl.extended}</b></span>
            <span>{r.deadlineFbar}: <b>{dl.fbar}</b></span>
          </div>
        </div>
      </div>

      {/* Estimated tax */}
      <div className="card space-y-3">
        <h3 className="flex items-center gap-2 text-base font-bold text-slate-900">
          <Calculator size={18} /> {r.estimateTitle}
        </h3>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-3">
          <EstRow label={r.est.earned} value={usd(est.earnedUsd)} />
          <EstRow label={r.est.passive} value={usd(est.passiveUsd)} />
          {est.feieExcludedUsd > 0 && (
            <EstRow label={r.est.feie} value={`−${usd(est.feieExcludedUsd)}`} />
          )}
          <EstRow label={r.est.taxable} value={usd(est.taxableUsd)} />
          <EstRow label={r.est.tentative} value={usd(est.tentativeTaxUsd)} />
          {est.foreignTaxCreditUsd > 0 && (
            <EstRow label={r.est.ftc} value={`−${usd(est.foreignTaxCreditUsd)}`} />
          )}
          {est.ctcUsd > 0 && <EstRow label={r.est.ctc} value={`−${usd(est.ctcUsd)}`} />}
          {est.refundableActcUsd > 0 && (
            <EstRow label={r.est.actc} value={`−${usd(est.refundableActcUsd)}`} />
          )}
          {est.seTaxUsd > 0 && <EstRow label={r.est.seTax} value={usd(est.seTaxUsd)} />}
          {est.niitUsd > 0 && <EstRow label={r.est.niit} value={usd(est.niitUsd)} />}
        </div>
        <div className="flex items-center justify-between border-t border-slate-200 pt-3">
          <span className="font-bold text-slate-900">
            {est.estimatedOwedUsd >= 0 ? r.est.owed : r.est.refund}
          </span>
          <span
            className={`text-xl font-bold ${
              est.estimatedOwedUsd > 0 ? "text-slate-900" : "text-emerald-600"
            }`}
          >
            {usd(Math.abs(est.estimatedOwedUsd))}
          </span>
        </div>
        <p className="text-xs text-slate-400">{r.estimateNote}</p>
      </div>

      {/* Foreign income method */}
      <div className="card space-y-3">
        <h3 className="text-base font-bold text-slate-900">{r.methodTitle}</h3>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {(["2555", "1116"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setForeignIncomeMethod(m)}
              className={`rounded-lg border p-3 text-left text-sm transition ${
                foreignIncomeMethod === m
                  ? "border-brand-500 bg-brand-50 text-brand-800"
                  : "border-slate-200 text-slate-600 hover:border-brand-300"
              }`}
            >
              {m === "2555" ? r.method2555 : r.method1116}
            </button>
          ))}
        </div>
        <p className="text-xs text-brand-700">
          {recMethod === "2555" ? r.methodRec2555 : r.methodRec1116}
        </p>
        <p className="text-xs text-slate-400">{r.methodNote}</p>
      </div>

      {/* Generate PDFs */}
      <div className="card space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="flex items-center gap-2 text-base font-bold text-slate-900">
              <FileDown size={18} className="text-brand-600" /> {s.generateTitle}
            </h3>
            <p className="mt-1 text-xs text-slate-400">{s.generateDesc}</p>
          </div>
          <button
            className="btn-primary shrink-0"
            onClick={handleGenerate}
            disabled={generating}
          >
            {generating ? (
              <>
                <Loader2 size={16} className="animate-spin" /> {s.generating}
              </>
            ) : (
              <>
                <Download size={16} /> {s.generateBtn}
              </>
            )}
          </button>
        </div>
        {genError && (
          <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-xs text-red-700">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <span>{genError}</span>
          </div>
        )}
      </div>

      {/* Manual downloads */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="card flex flex-col">
          <FileCode2 className="mb-2 text-brand-600" size={24} />
          <h4 className="font-bold text-slate-900">{s.configTitle}</h4>
          <p className="mb-4 flex-1 text-xs text-slate-400">{s.configDesc}</p>
          <button
            className="btn-primary"
            onClick={() => downloadFile("config.yaml", yaml, "application/x-yaml")}
          >
            <Download size={16} /> {s.downloadYaml}
          </button>
        </div>

        <div className="card flex flex-col">
          <FileSpreadsheet className="mb-2 text-emerald-600" size={24} />
          <h4 className="font-bold text-slate-900">
            {inter(s.fbarTitle, { year: taxYear })}
          </h4>
          <p className="mb-4 flex-1 text-xs text-slate-400">{s.fbarDesc}</p>
          <button
            className="btn-primary"
            onClick={() =>
              downloadFile(`fbar_${taxYear}.csv`, csv, "text/csv")
            }
          >
            <Download size={16} /> {s.downloadCsv}
          </button>
        </div>
      </div>

      {/* YAML preview */}
      <div className="card">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900">
          <Eye size={16} /> {s.previewTitle}
        </h3>
        <pre className="max-h-80 overflow-auto rounded-lg bg-slate-900 p-4 text-xs leading-relaxed text-slate-100">
          {yaml}
        </pre>
      </div>

      {/* Filing History */}
      <div className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-base font-bold text-slate-900">
            <History size={18} /> {s.historyTitle}
          </h3>
          <div className="flex flex-wrap gap-2">
            <button className="btn-ghost" onClick={() => window.print()}>
              <Printer size={16} /> {r.printBtn}
            </button>
            <button
              className="btn-ghost"
              onClick={() =>
                downloadFile(
                  `tax-backup-${new Date().toISOString().slice(0, 10)}.json`,
                  JSON.stringify(exportBackup(), null, 2),
                  "application/json"
                )
              }
            >
              <Download size={16} /> {r.backupExport}
            </button>
            <button className="btn-ghost" onClick={() => fileInput.current?.click()}>
              <Upload size={16} /> {r.backupImport}
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onImportFile(f);
                e.target.value = "";
              }}
            />
            <button className="btn-primary" onClick={() => saveSnapshot()}>
              <Save size={16} /> {s.historySave}
            </button>
          </div>
        </div>
        <p className="text-xs text-slate-400">{r.backupDesc}</p>

        {filingSnapshots.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-400">{s.historyEmpty}</p>
        ) : (
          <div className="space-y-2">
            {filingSnapshots.map((snap) => (
              <div
                key={snap.id}
                className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-slate-800">{snap.label}</p>
                  <p className="text-xs text-slate-400">
                    {new Date(snap.savedAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    className="flex items-center gap-1 rounded px-3 py-1.5 text-xs font-medium text-brand-600 hover:bg-brand-50"
                    onClick={() => {
                      if (window.confirm(`Restore "${snap.label}"? Current data will be replaced.`)) {
                        loadSnapshot(snap.id);
                      }
                    }}
                  >
                    <RotateCcw size={13} /> {s.historyLoad}
                  </button>
                  <button
                    className="flex items-center gap-1 rounded px-2 py-1.5 text-xs text-slate-400 hover:bg-red-50 hover:text-red-500"
                    onClick={() => {
                      if (window.confirm(`Delete "${snap.label}"?`)) {
                        deleteSnapshot(snap.id);
                      }
                    }}
                  >
                    <Trash2 size={13} /> {s.historyDelete}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>

    {/* Print-only summary (browser print-to-PDF) */}
    <div className="print-summary">
      <h1 style={{ fontSize: 20, fontWeight: 700 }}>
        {taxpayer.firstName} {taxpayer.lastName} — TY {taxYear}
      </h1>
      <p>{taxpayer.filingStatus}</p>
      <hr />
      <p><b>{s.earnedLabel}:</b> {usd(grossUsd)} · <b>{s.passiveLabel}:</b> {usd(passiveUsd)} · <b>{s.fbarLabel}:</b> {usd(fbarUsd)}</p>
      <h2 style={{ fontSize: 15, fontWeight: 700, marginTop: 12 }}>{r.formsTitle}</h2>
      <ul>
        {forms.map((f) => (
          <li key={f.form}>
            {f.form} — {r.forms[f.key as keyof typeof r.forms]} ({f.generated ? r.generatedTag : r.manualTag})
          </li>
        ))}
      </ul>
      <h2 style={{ fontSize: 15, fontWeight: 700, marginTop: 12 }}>{r.estimateTitle}</h2>
      <p>{r.est.taxable}: {usd(est.taxableUsd)} · {r.est.tentative}: {usd(est.tentativeTaxUsd)}</p>
      <p><b>{est.estimatedOwedUsd >= 0 ? r.est.owed : r.est.refund}: {usd(Math.abs(est.estimatedOwedUsd))}</b></p>
      <h2 style={{ fontSize: 15, fontWeight: 700, marginTop: 12 }}>{r.deadlineTitle}</h2>
      <p>{r.deadlineAbroad}: {dl.abroad} · {r.deadlineExtended}: {dl.extended} · {r.deadlineFbar}: {dl.fbar}</p>
      <p style={{ marginTop: 12, fontSize: 11, color: "#888" }}>{r.estimateNote}</p>
    </div>
    </>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="card">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
      <p className="text-xs text-slate-400">{sub}</p>
    </div>
  );
}

function EstRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-800">{value}</span>
    </div>
  );
}
