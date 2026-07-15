import { useState, useEffect } from "react";
import { motion } from "motion/react";
import type { ActionMask } from "@poker/shared";
import { Button } from "../components/ui/button.js";
import { Slider } from "../components/ui/slider.js";
import { maskToButtons, clampRaiseTo, formatChips } from "./viewHelpers.js";
import { potPresets } from "./potPresets.js";

export default function ActionBar({
  mask,
  currentBet,
  potTotal,
  bb,
  onAction,
}: {
  mask: ActionMask;
  currentBet: number;
  potTotal: number;
  bb: number;
  onAction: (action: "fold" | "check" | "call" | "raise", amount?: number) => void;
}) {
  const b = maskToButtons(mask);
  const [raiseTo, setRaiseTo] = useState<number>(mask.minRaiseTo);

  useEffect(() => {
    setRaiseTo(mask.minRaiseTo);
  }, [mask]);

  const presets = potPresets(mask, potTotal, currentBet);

  function step(delta: number) {
    setRaiseTo((v) => clampRaiseTo(v + delta, mask));
  }

  return (
    <motion.div
      initial={{ y: 24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="flex items-end gap-4 border-t border-edge bg-surface/95 px-4 py-3 backdrop-blur"
    >
      {b.raise && (
        <div className="flex flex-1 flex-col gap-2">
          <div className="flex items-center justify-between text-xs text-neutral-400">
            <span>Raise Amount</span>
            <span className="font-mono-num text-neutral-200">{formatChips(raiseTo)}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="icon-sm"
              onClick={() => step(-bb)}
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
            />
            <Button
              variant="secondary"
              size="icon-sm"
              onClick={() => step(bb)}
              aria-label="Increase raise"
            >
              +
            </Button>
          </div>
          <div className="flex gap-1.5">
            {presets.map((p) => (
              <Button
                key={p.label}
                variant="secondary"
                size="sm"
                onClick={() => setRaiseTo(p.raiseTo)}
                title={`Raise to ${formatChips(p.raiseTo)}`}
              >
                {p.label}
              </Button>
            ))}
          </div>
        </div>
      )}
      <div className="flex items-center gap-2">
        {b.fold && (
          <Button variant="outline" className="border-danger text-danger hover:bg-danger/10" onClick={() => onAction("fold")}>
            Fold
          </Button>
        )}
        {b.check && (
          <Button variant="secondary" onClick={() => onAction("check")}>
            Check
          </Button>
        )}
        {b.call && (
          <Button variant="secondary" onClick={() => onAction("call", b.callAmount)}>
            Call {formatChips(b.callAmount)}
          </Button>
        )}
        {b.raise && (
          <Button
            className="bg-emerald text-neutral-900 shadow-[0_0_16px_rgba(47,217,135,0.5)] hover:bg-emerald-hover"
            onClick={() => onAction("raise", clampRaiseTo(raiseTo, mask))}
          >
            Raise / To {formatChips(raiseTo)}
          </Button>
        )}
      </div>
    </motion.div>
  );
}
