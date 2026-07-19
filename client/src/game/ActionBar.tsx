import type React from "react";
import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "motion/react";
import type { ActionMask } from "@poker/shared";
import { Button } from "../components/ui/button.js";
import { Slider } from "../components/ui/slider.js";
import { maskToButtons, clampRaiseTo, formatChips } from "./viewHelpers.js";
import { potPresets } from "./potPresets.js";

/** Small keycap hint chip. */
function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="ml-1 hidden rounded border border-edge-bright bg-black/30 px-1 font-mono-num text-[9px] leading-4 text-neutral-400 sm:inline-block">
      {children}
    </kbd>
  );
}

export default function ActionBar({
  mask,
  currentBet,
  potTotal,
  bb,
  compact = false,
  onAction,
}: {
  mask: ActionMask;
  currentBet: number;
  potTotal: number;
  bb: number;
  compact?: boolean;
  onAction: (action: "fold" | "check" | "call" | "raise", amount?: number) => void;
}) {
  const b = maskToButtons(mask);
  const [raiseTo, setRaiseTo] = useState<number>(mask.minRaiseTo);
  const sliderWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setRaiseTo(mask.minRaiseTo);
  }, [mask]);

  const presets = potPresets(mask, potTotal, currentBet);

  const confirmRaise = useCallback(() => {
    if (b.raise) onAction("raise", clampRaiseTo(raiseTo, mask));
  }, [b.raise, onAction, raiseTo, mask]);

  // Keyboard shortcuts. This listener lives with the ActionBar, which is mounted
  // ONLY while it is the hero's turn, so the hotkeys are naturally inert (and
  // cleaned up) the rest of the time. Typing in an input/textarea is ignored.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || el?.isContentEditable) return;
      const k = e.key.toLowerCase();
      if (k === "f" && b.fold) {
        e.preventDefault();
        onAction("fold");
      } else if (k === "c") {
        if (b.check) {
          e.preventDefault();
          onAction("check");
        } else if (b.call) {
          e.preventDefault();
          onAction("call", b.callAmount);
        }
      } else if (k === "r" && b.raise) {
        e.preventDefault();
        sliderWrapRef.current?.querySelector<HTMLElement>('[role="slider"]')?.focus();
      } else if (e.key === "Enter" && b.raise) {
        e.preventDefault();
        confirmRaise();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [b.fold, b.check, b.call, b.raise, b.callAmount, onAction, confirmRaise]);

  return (
    <motion.div
      initial={{ y: 30, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 320, damping: 28 }}
      className={
        compact
          ? "fixed inset-x-0 bottom-0 z-30 flex flex-col gap-3 border-t border-edge bg-surface-2/95 px-3 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] shadow-e3 backdrop-blur-md"
          : "pointer-events-auto mx-auto mb-4 flex w-[min(720px,94vw)] flex-col gap-3 rounded-2xl border border-edge bg-surface-2/70 p-3 shadow-e3 backdrop-blur-md"
      }
    >
      {b.raise && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-label-caps text-neutral-500">Raise To</span>
            <span className="text-stat text-2xl font-bold text-emerald tabular-nums">
              {formatChips(raiseTo)}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {presets.map((p) => (
              <Button
                key={p.label}
                variant="secondary"
                size={compact ? "default" : "sm"}
                className={compact ? "h-9 flex-1" : ""}
                onClick={() => setRaiseTo(p.raiseTo)}
                title={`Raise to ${formatChips(p.raiseTo)}`}
              >
                {p.label}
              </Button>
            ))}
          </div>
          <div ref={sliderWrapRef} className="flex items-center gap-3">
            <Button
              variant="secondary"
              size="icon-sm"
              onClick={() => setRaiseTo((v) => clampRaiseTo(v - bb, mask))}
              aria-label="Decrease raise"
            >
              −
            </Button>
            <Slider
              min={mask.minRaiseTo}
              max={mask.maxRaiseTo}
              value={[raiseTo]}
              onValueChange={([v]) => setRaiseTo(clampRaiseTo(v ?? mask.minRaiseTo, mask))}
              className="flex-1"
              aria-label="Raise amount"
            />
            <Button
              variant="secondary"
              size="icon-sm"
              onClick={() => setRaiseTo((v) => clampRaiseTo(v + bb, mask))}
              aria-label="Increase raise"
            >
              +
            </Button>
          </div>
        </div>
      )}

      <div className={`flex items-center gap-2 ${compact ? "" : "justify-center"}`}>
        {b.fold && (
          <Button
            variant="outline"
            className={`border-danger/60 text-danger hover:bg-danger/10 ${compact ? "h-11 flex-1" : ""}`}
            onClick={() => onAction("fold")}
          >
            Fold
            <Kbd>F</Kbd>
          </Button>
        )}
        {b.check && (
          <Button
            variant="secondary"
            className={compact ? "h-11 flex-1" : ""}
            onClick={() => onAction("check")}
          >
            Check
            <Kbd>C</Kbd>
          </Button>
        )}
        {b.call && (
          <Button
            variant="secondary"
            className={compact ? "h-11 flex-1" : ""}
            onClick={() => onAction("call", b.callAmount)}
          >
            Call {formatChips(b.callAmount)}
            <Kbd>C</Kbd>
          </Button>
        )}
        {b.raise && (
          <Button
            className={`bg-emerald text-neutral-950 shadow-glow-sm hover:bg-emerald-hover ${compact ? "h-11 flex-[1.4]" : ""}`}
            onClick={confirmRaise}
          >
            {b.call || b.check ? "Raise" : "Bet"} {formatChips(raiseTo)}
            <Kbd>↵</Kbd>
          </Button>
        )}
      </div>
    </motion.div>
  );
}
