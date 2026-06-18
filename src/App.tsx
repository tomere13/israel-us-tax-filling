import { useState } from "react";
import { ChevronLeft, ChevronRight, HelpCircle, CalendarClock } from "lucide-react";
import { Sidebar } from "./components/Sidebar";
import { StepHelp } from "./components/StepHelp";
import { Step1Profile } from "./steps/Step1Profile";
import { Step2Income } from "./steps/Step2Income";
import { Step3Passive } from "./steps/Step3Passive";
import { Step4Fbar } from "./steps/Step4Fbar";
import { Step5Export } from "./steps/Step5Export";
import { useStore } from "./store/useStore";
import { deadlines } from "./utils/forms";
import { useTranslation, inter } from "./i18n";

const STEP_COMPONENTS = [
  Step1Profile,
  Step2Income,
  Step3Passive,
  Step4Fbar,
  Step5Export,
];

export default function App() {
  const [step, setStep] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const { t } = useTranslation();
  const taxYear = useStore((s) => s.taxYear);
  const Current = STEP_COMPONENTS[step];
  const last = t.steps.length - 1;
  const dl = deadlines(taxYear);

  const STEP_HELPS = [
    t.step1.help,
    t.step2.help,
    t.step3.help,
    t.step4.help,
    t.step5.help,
  ];

  const go = (i: number) => {
    setStep(Math.max(0, Math.min(last, i)));
    setHelpOpen(false);
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar current={step} onSelect={go} />

      <main className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-8 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-brand-600">
              {inter(t.nav.stepOf, { n: step + 1, total: t.steps.length })}
            </p>
            <h2 className="text-lg font-bold text-slate-900">
              {t.steps[step].title}
            </h2>
          </div>
          <div className="flex gap-2">
            <button
              className={`btn-ghost ${helpOpen ? "bg-brand-50 text-brand-700" : ""}`}
              onClick={() => setHelpOpen((v) => !v)}
            >
              <HelpCircle size={16} />
              {helpOpen ? t.common.hideHelp : t.common.showHelp}
            </button>
            <button
              className="btn-ghost"
              onClick={() => go(step - 1)}
              disabled={step === 0}
            >
              <ChevronLeft size={16} /> {t.nav.back}
            </button>
            <button
              className="btn-primary"
              onClick={() => go(step + 1)}
              disabled={step === last}
            >
              {t.nav.next} <ChevronRight size={16} />
            </button>
          </div>
        </header>

        <div className="flex items-center justify-center gap-2 border-b border-amber-100 bg-amber-50 px-8 py-1.5 text-xs font-medium text-amber-800 print:hidden">
          <CalendarClock size={13} className="shrink-0" />
          {inter(t.review.banner, { abroad: dl.abroad, fbar: dl.fbar })}
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-6">
          <div className="mx-auto max-w-4xl space-y-6">
            {helpOpen && (
              <StepHelp
                content={STEP_HELPS[step]}
                onClose={() => setHelpOpen(false)}
              />
            )}
            <Current />
          </div>
        </div>
      </main>
    </div>
  );
}
