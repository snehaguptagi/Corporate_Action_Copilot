import { ArrowRight, Check } from "lucide-react";
import { journeyStages } from "@/lib/status";

type JourneyStripProps = {
  /** 0-4 marks the current step for a single case; 5 means all done. Omit for the overview strip. */
  activeIndex?: number;
  /** Open-case counts per step for the overview strip. */
  counts?: number[];
  className?: string;
};

/** Horizontal left-to-right view of the five steps a corporate action walks through. */
export function JourneyStrip({ activeIndex, counts, className }: JourneyStripProps) {
  return (
    <ol className={`flex flex-nowrap items-start gap-x-1.5 overflow-x-auto pb-1 ${className ?? ""}`}>
      {journeyStages.map((stage, index) => {
        const done = activeIndex !== undefined && index < activeIndex;
        const active = activeIndex !== undefined && index === activeIndex;
        const count = counts?.[index];
        return (
          <li key={stage.id} className="flex shrink-0 items-start gap-1.5">
            {index > 0 && <ArrowRight className="mt-1.5 h-3.5 w-3.5 shrink-0 text-slate-300" aria-hidden="true" />}
            <div className="flex items-start gap-2">
              <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                done ? "bg-success text-white"
                : active ? "bg-primary text-primary-foreground"
                : "border border-slate-300 bg-white text-slate-500"
              }`}>
                {done ? <Check className="h-3.5 w-3.5" /> : index + 1}
              </span>
              <span className="min-w-0 max-w-[170px]">
                <span className={`block text-xs font-semibold leading-5 ${active ? "text-foreground" : done ? "text-slate-700" : "text-slate-600"}`}>
                  {stage.label}
                  {active && <span className="ml-1.5 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">This case is here</span>}
                </span>
                <span className="block text-[11px] leading-4 text-slate-500">{stage.hint}</span>
                {count !== undefined && (
                  <span className={`figure-inline block text-[11px] font-semibold leading-5 ${count > 0 ? "text-foreground" : "text-slate-400"}`}>
                    {count} case{count === 1 ? "" : "s"} here now
                  </span>
                )}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
