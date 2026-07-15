import { motion } from "motion/react";
import type { PublicSeat } from "@poker/shared";
import CardView from "./CardView.js";
import { formatChips } from "./viewHelpers.js";
import { avatarUrl } from "../data/avatar.js";

const ACTION_LABEL: Record<string, string> = {
  fold: "FOLD",
  check: "CHECK",
  call: "CALL",
  raise: "RAISE",
};

// Emerald pill for aggressive actions, neutral for check/call, danger for fold.
const ACTION_CLASS: Record<string, string> = {
  fold: "bg-danger text-neutral-900",
  check: "bg-surface-2 text-neutral-200 border border-edge",
  call: "bg-surface-2 text-neutral-200 border border-edge",
  raise: "bg-emerald text-neutral-900",
};

const POSITION_COLOR: Record<string, string> = {
  BTN: "#f0c419",
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
}) {
  if (!seat) {
    return (
      <div className="grid h-[92px] w-32 place-items-center rounded-xl border border-edge/60 bg-surface/40 text-center">
        <span className="text-xs text-neutral-500">empty</span>
      </div>
    );
  }
  const hole = seat.holeCards ?? (isOwn ? ownHole : null);
  const label = seat.isBot ? `🤖 ${seat.id}` : seat.id.slice(0, 8);
  const dim = seat.status === "folded" || seat.status === "busted";

  return (
    <div className="relative">
      {position && (
        <div
          className="absolute -top-2.5 -left-2.5 z-10 rounded-md px-1.5 py-0.5 text-[11px] font-extrabold text-neutral-900 shadow"
          style={{ background: POSITION_COLOR[position] ?? "#374151" }}
        >
          {position}
        </div>
      )}
      {isDealer && (
        <motion.div
          layoutId="dealer-button"
          transition={{ type: "spring", stiffness: 300, damping: 26 }}
          className="absolute -top-2.5 -right-2.5 z-10 grid h-6 w-6 place-items-center rounded-full border border-edge bg-white text-[11px] font-extrabold text-neutral-900 shadow"
        >
          D
        </motion.div>
      )}
      {lastAction && (
        <motion.div
          key={`${lastAction.action}-${lastAction.amount}`}
          initial={{ scale: 1.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className={`absolute -top-4 left-1/2 z-10 -translate-x-1/2 rounded-full px-2.5 py-0.5 text-xs font-extrabold tracking-wide whitespace-nowrap shadow ${ACTION_CLASS[lastAction.action] ?? "bg-surface-2 text-neutral-200"}`}
        >
          {ACTION_LABEL[lastAction.action] ?? lastAction.action}
          {(lastAction.action === "call" || lastAction.action === "raise") && lastAction.amount > 0
            ? ` ${formatChips(lastAction.amount)}`
            : ""}
        </motion.div>
      )}

      <div
        className={`relative w-32 rounded-xl border bg-surface p-2 text-center ${dim ? "opacity-50 grayscale" : ""} ${
          isWinner ? "border-gold shadow-[0_0_22px_rgba(232,195,90,0.7)]" : "border-edge"
        }`}
      >
        {isToAct && (
          <motion.div
            className="pointer-events-none absolute inset-0 rounded-xl border-2 border-emerald"
            animate={{ boxShadow: ["0 0 0 0 rgba(47,217,135,0.5)", "0 0 0 8px rgba(47,217,135,0)"] }}
            transition={{ repeat: Infinity, duration: 1.2 }}
          />
        )}
        <div className="mb-1 flex items-center justify-center gap-1.5">
          <img src={avatarUrl(seat.id)} alt="" className="h-6 w-6 rounded-full bg-surface-2" />
          <span className="truncate text-xs text-neutral-300">
            {label}
            {isOwn ? " (you)" : ""}
          </span>
        </div>
        <div className="flex justify-center">
          <CardView card={hole ? hole[0] : null} />
          <CardView card={hole ? hole[1] : null} />
        </div>
        <div className="mt-1 font-mono-num text-[13px] text-neutral-200">
          {formatChips(seat.stack)}
          {seat.status === "allin" ? " · ALL IN" : ""}
        </div>
      </div>

      {seat.committedThisStreet > 0 && (
        <motion.div
          layoutId={`commit-${seatIndex}`}
          transition={{ type: "spring", stiffness: 260, damping: 24 }}
          className="absolute top-full left-1/2 z-10 mt-1 -translate-x-1/2 rounded-full border border-edge bg-surface-2 px-2 py-0.5 font-mono-num text-xs whitespace-nowrap text-neutral-300"
        >
          {formatChips(seat.committedThisStreet)}
        </motion.div>
      )}
    </div>
  );
}
