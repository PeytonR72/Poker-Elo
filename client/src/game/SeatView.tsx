import { motion } from "motion/react";
import type { PublicSeat } from "@poker/shared";
import CardView from "./CardView.js";
import TimebankRing from "./TimebankRing.js";
import { formatChips } from "./viewHelpers.js";
import { CountUp } from "../components/count-up.js";
import { ChipStack } from "../components/poker-chip.js";
import { TierAvatar } from "../components/tier-avatar.js";
import { DealerButton } from "../components/dealer-button.js";
import { displayName } from "../data/displayName.js";

const ACTION_LABEL: Record<string, string> = {
  fold: "FOLD",
  check: "CHECK",
  call: "CALL",
  raise: "RAISE",
};

// Emerald pill for aggressive actions, neutral for check/call, danger for fold.
const ACTION_CLASS: Record<string, string> = {
  fold: "bg-danger/90 text-neutral-950",
  check: "bg-surface-3 text-neutral-200 border border-edge-bright",
  call: "bg-surface-3 text-neutral-200 border border-edge-bright",
  raise: "bg-emerald text-neutral-950",
};

const POSITION_COLOR: Record<string, string> = {
  BTN: "#e8c35a",
  SB: "#38bdf8",
  BB: "#38bdf8",
  LJ: "#94a3b8",
  HJ: "#94a3b8",
  CO: "#94a3b8",
};

export default function SeatView({
  seat,
  seatIndex,
  isOwn,
  isToAct,
  isDealer,
  ownHole,
  lastAction,
  position,
  isWinner,
  name,
  rating,
  turnRemainingMs,
  turnDurationMs,
  turnKey,
  compact = false,
}: {
  seat: PublicSeat | null;
  seatIndex: number;
  isOwn: boolean;
  isToAct: boolean;
  isDealer: boolean;
  ownHole: [number, number] | null;
  lastAction?: { action: string; amount: number };
  position?: string;
  isWinner?: boolean;
  name?: string;
  rating?: number;
  /** Remaining turn time (ms) for the ring; null when this seat is not to act. */
  turnRemainingMs?: number | null;
  /** Total turn allotment (ms) — the ring's full-circle duration, so a
   *  mid-turn mount (e.g. reconnect) starts at the correct partial fraction. */
  turnDurationMs?: number;
  /** Changes when the acting seat/turn changes, to remount+restart the ring. */
  turnKey?: string;
  compact?: boolean;
}) {
  const avatarSize = compact ? 34 : 44;
  // Hero's face-up cards are noticeably larger than opponent backs on desktop
  // so your own hand is instantly readable; compact keeps one size to fit 390px.
  const cardSize = compact
    ? "h-[2.6rem] w-[1.85rem]"
    : isOwn
      ? "h-[4.6rem] w-[3.3rem]"
      : "h-[3.2rem] w-[2.3rem]";
  const podWidth = compact ? "w-[92px]" : "w-[132px]";

  if (!seat) {
    return (
      <div
        className={`grid place-items-center rounded-2xl border border-edge/50 bg-surface/30 text-center ${podWidth}`}
        style={{ height: compact ? 64 : 92 }}
      >
        <span className="text-label-caps text-[9px] text-neutral-600">Empty</span>
      </div>
    );
  }

  const hole = seat.holeCards ?? (isOwn ? ownHole : null);
  const folded = seat.status === "folded" || seat.status === "busted";
  const allin = seat.status === "allin";
  const label = name ?? displayName({ id: seat.id });

  return (
    <motion.div
      className="relative flex flex-col items-center"
      animate={{ y: isToAct ? -4 : 0, opacity: folded ? 0.55 : 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 26 }}
    >
      {/* Last-action pill */}
      {lastAction && !folded && (
        <motion.div
          key={`${lastAction.action}-${lastAction.amount}`}
          initial={{ scale: 1.3, opacity: 0, y: 4 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className={`absolute -top-3 z-20 rounded-full px-2.5 py-0.5 text-[10px] font-extrabold tracking-wide whitespace-nowrap shadow-e1 ${ACTION_CLASS[lastAction.action] ?? "bg-surface-3 text-neutral-200"}`}
        >
          {ACTION_LABEL[lastAction.action] ?? lastAction.action}
          {(lastAction.action === "call" || lastAction.action === "raise") && lastAction.amount > 0
            ? ` ${formatChips(lastAction.amount)}`
            : ""}
        </motion.div>
      )}

      {/* Pod */}
      <div
        className={`relative flex flex-col items-center gap-1 rounded-2xl border px-2 pt-2 pb-1.5 ${podWidth} ${
          folded ? "grayscale" : ""
        } ${
          isWinner
            ? "border-gold bg-surface shadow-glow-gold"
            : isToAct
              ? "border-emerald/70 bg-surface shadow-glow-md"
              : "border-edge bg-surface/90"
        }`}
      >
        {/* Avatar + rings + badges */}
        <div className="relative" style={{ width: avatarSize, height: avatarSize }}>
          <TierAvatar seed={seat.id} rating={rating} name={label} size={avatarSize} />
          {isToAct && turnRemainingMs != null && (
            <TimebankRing
              key={turnKey ?? "turn"}
              size={avatarSize + 6}
              remainingMs={turnRemainingMs}
              durationMs={turnDurationMs ?? turnRemainingMs}
            />
          )}
          {position && (
            <span
              className="absolute -top-1 -left-1 z-10 rounded-md px-1 py-px text-[9px] font-extrabold text-neutral-950 shadow-e1"
              style={{ background: POSITION_COLOR[position] ?? "#64748b" }}
            >
              {position}
            </span>
          )}
          {isDealer && (
            <motion.span
              layoutId="dealer-button"
              transition={{ type: "spring", stiffness: 300, damping: 26 }}
              className="absolute -right-1.5 -bottom-1.5 z-10"
            >
              <DealerButton size={compact ? 16 : 20} />
            </motion.span>
          )}
        </div>

        {/* Name */}
        <span className="max-w-full truncate text-[11px] leading-tight text-neutral-300">
          {label}
          {isOwn ? " (you)" : ""}
        </span>

        {/* Stack / all-in */}
        {allin ? (
          <span className="rounded-full bg-gold/15 px-2 py-px text-label-caps text-[9px] text-gold">
            ALL IN
          </span>
        ) : (
          <CountUp
            value={seat.stack}
            format={formatChips}
            className="text-stat text-[13px] font-semibold text-neutral-100"
          />
        )}
      </div>

      {/* Hole cards below the pod */}
      <motion.div
        className="mt-1 flex"
        animate={
          folded
            ? { opacity: 0, scale: 0.55, y: -14 }
            : { opacity: 1, scale: 1, y: 0 }
        }
        transition={{ duration: 0.4, ease: "easeInOut" }}
        style={{ perspective: 600 }}
      >
        <CardView card={hole ? hole[0] : null} className={cardSize} />
        <CardView card={hole ? hole[1] : null} className={cardSize} />
      </motion.div>

      {/* Street bet chips (glide to pot via shared layoutId on street end) */}
      {seat.committedThisStreet > 0 && !folded && (
        <motion.div
          layoutId={`commit-${seatIndex}`}
          transition={{ type: "spring", stiffness: 260, damping: 24 }}
          className="absolute -bottom-8 z-10"
        >
          <ChipStack amount={seat.committedThisStreet} size={20} max={4} showLabel={false} />
        </motion.div>
      )}
    </motion.div>
  );
}
