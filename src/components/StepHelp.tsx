import { X, ChevronRight } from "lucide-react";

interface HelpBlock {
  label: string;
  items: string[];
}

export interface HelpContent {
  summary: string;
  blocks: readonly HelpBlock[] | HelpBlock[];
}

export function StepHelp({
  content,
  onClose,
}: {
  content: HelpContent;
  onClose: () => void;
}) {
  return (
    <div className="rounded-xl border border-brand-100 bg-brand-50 p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-brand-800 font-medium leading-snug">
          {content.summary}
        </p>
        <button
          onClick={onClose}
          className="shrink-0 rounded p-0.5 text-brand-400 hover:text-brand-600 transition"
        >
          <X size={14} />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {content.blocks.map((block) => (
          <div key={block.label} className="space-y-1.5">
            <p className="text-xs font-bold uppercase tracking-wide text-brand-700">
              {block.label}
            </p>
            <ul className="space-y-1">
              {block.items.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-1.5 text-xs text-brand-700"
                >
                  <ChevronRight
                    size={12}
                    className="mt-0.5 shrink-0 text-brand-400"
                  />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
