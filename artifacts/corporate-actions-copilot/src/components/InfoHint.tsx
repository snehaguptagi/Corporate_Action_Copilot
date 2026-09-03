import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type InfoHintProps = {
  /** Short name of the thing being explained, shown as the popover heading. */
  title?: string;
  children: ReactNode;
  className?: string;
};

/**
 * A small "i" button that explains a page or term in plain language.
 * Click or tap to open; works with keyboard and touch.
 */
export function InfoHint({ title, children, className }: InfoHintProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={title ? `What does ${title} mean?` : "What does this mean?"}
          className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-accent-soft hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${className ?? ""}`}
        >
          <Info className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="start" className="w-80 max-w-[90vw] p-3">
        {title && <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.12em] text-primary">{title}</p>}
        <div className="text-[13px] font-normal normal-case leading-5 tracking-normal text-slate-700">{children}</div>
      </PopoverContent>
    </Popover>
  );
}
