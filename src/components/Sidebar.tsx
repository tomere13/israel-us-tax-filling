import {
  Check,
  FileText,
  Banknote,
  Landmark,
  PiggyBank,
  Download,
  ShieldCheck,
  AlertCircle,
} from "lucide-react";
import { useTranslation, type Locale } from "../i18n";
import { useStore } from "../store/useStore";
import { validate } from "../utils/validate";

const ICONS = [FileText, Banknote, PiggyBank, Landmark, Download];

export function Sidebar({
  current,
  onSelect,
}: {
  current: number;
  onSelect: (i: number) => void;
}) {
  const { t, locale, setLocale, locales } = useTranslation();
  const state = useStore();
  // Steps with a blocking error get an amber badge.
  const errorSteps = new Set(
    validate(state)
      .filter((i) => i.severity === "error")
      .map((i) => i.step)
  );

  return (
    <aside className="flex w-72 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="flex items-center gap-2 px-6 py-5">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand-600 text-white">
          <ShieldCheck size={18} />
        </div>
        <div>
          <h1 className="text-sm font-bold leading-tight text-slate-900">
            {t.sidebar.title}
          </h1>
          <p className="text-xs text-slate-500">{t.sidebar.subtitle}</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {t.steps.map((step, i) => {
          const Icon = ICONS[i];
          const active = i === current;
          const done = i < current;
          const hasError = errorSteps.has(i);
          return (
            <button
              key={i}
              onClick={() => onSelect(i)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition ${
                active
                  ? "bg-brand-50 text-brand-700"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <span
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${
                  active
                    ? "bg-brand-600 text-white"
                    : done
                      ? "bg-emerald-500 text-white"
                      : "bg-slate-100 text-slate-500"
                }`}
              >
                {done ? <Check size={14} /> : <Icon size={14} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold leading-tight">
                  {step.title}
                </span>
                <span className="block truncate text-xs text-slate-400">
                  {step.subtitle}
                </span>
              </span>
              {hasError && (
                <AlertCircle size={14} className="shrink-0 text-amber-500" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Language switcher */}
      <div className="m-3 rounded-lg border border-slate-100 bg-slate-50 p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Language
        </p>
        <div className="grid grid-cols-2 gap-1">
          {locales.map(({ locale: l, label }) => (
            <button
              key={l}
              onClick={() => setLocale(l as Locale)}
              className={`rounded px-2 py-1 text-xs font-medium transition ${
                l === locale
                  ? "bg-brand-600 text-white"
                  : "text-slate-600 hover:bg-slate-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-3 mb-3 rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-500">
        <ShieldCheck size={14} className="mb-1 inline text-emerald-500" />{" "}
        {t.sidebar.privacy}
      </div>
    </aside>
  );
}
