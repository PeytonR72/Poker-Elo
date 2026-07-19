import { motion } from "motion/react";
import { MATCH_FORMATS, type MatchFormat } from "@poker/shared";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../components/ui/tooltip.js";

/** Human blind-structure + duration summary, entirely derived from the format. */
function formatSummary(f: MatchFormat): {
  minutes: number;
  levelMinutes: number;
  turnSec: number;
  firstBlind: string;
  topBlind: string;
} {
  const first = f.blindLevels[0]!;
  const top = f.blindLevels[f.blindLevels.length - 1]!;
  return {
    minutes: Math.round(f.matchDurationMs / 60_000),
    levelMinutes: Math.round(f.blindLevelDurationMs / 60_000),
    turnSec: Math.round(f.turnTimeMs / 1000),
    firstBlind: `${first.sb}/${first.bb}`,
    topBlind: `${top.sb}/${top.bb}`,
  };
}

export default function FormatSegmentedControl({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const formats = Object.values(MATCH_FORMATS);

  return (
    <TooltipProvider delayDuration={150}>
      <div
        role="tablist"
        aria-label="Match format"
        className="flex w-full items-center gap-1 rounded-xl border border-edge bg-surface-2/80 p-1"
      >
        {formats.map((f) => {
          const selected = f.id === value;
          const s = formatSummary(f);
          return (
            <Tooltip key={f.id}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  disabled={disabled}
                  onClick={() => onChange(f.id)}
                  className={`relative flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    selected ? "text-neutral-950" : "text-muted-foreground hover:text-neutral-100"
                  }`}
                >
                  {selected && (
                    <motion.span
                      layoutId="arena-format-pill"
                      className="absolute inset-0 -z-0 rounded-lg bg-emerald shadow-glow-sm"
                      transition={{ type: "spring", stiffness: 380, damping: 32 }}
                    />
                  )}
                  <span className="relative z-10">{f.label}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[15rem]">
                <div className="flex flex-col gap-0.5">
                  <span className="font-semibold text-neutral-100">
                    {f.label} · {s.minutes} min
                  </span>
                  <span className="text-muted-foreground">
                    Blinds {s.firstBlind} → {s.topBlind}, up every {s.levelMinutes} min
                  </span>
                  <span className="text-muted-foreground">{s.turnSec}s per turn</span>
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
