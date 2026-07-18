import { useEffect, useRef } from "react";
import { LogOut } from "lucide-react";
import { toast } from "sonner";
import { useMatchSocket } from "./useMatchSocket.js";
import { usePlayerNames } from "./usePlayerNames.js";
import { useIsCompact } from "./useIsCompact.js";
import Table from "./Table.js";
import ActionBar from "./ActionBar.js";
import MatchClock from "./MatchClock.js";
import MatchOver from "./MatchOver.js";
import Logo from "../shell/Logo.js";
import { Button } from "../components/ui/button.js";
import { blindLevelLabel, formatChips } from "./viewHelpers.js";
import { displayName } from "../data/displayName.js";

export default function GameScreen({
  roomId,
  getJwt,
  ownId,
  onLeave,
}: {
  roomId: string;
  getJwt: () => string | null;
  ownId: string | null;
  onLeave: () => void;
}) {
  const { state, sendAction } = useMatchSocket(roomId, getJwt);
  const compact = useIsCompact();
  const names = usePlayerNames(state.view?.seats.map((s) => s?.id) ?? []);

  // Fire a match-end toast with the hero's rating delta exactly once.
  const toasted = useRef(false);
  useEffect(() => {
    if (!state.result || toasted.current) return;
    toasted.current = true;
    const delta = ownId ? (state.result.eloDeltas[ownId] ?? 0) : 0;
    const place = ownId ? state.result.finishPlaceById[ownId] : undefined;
    const sign = delta >= 0 ? "+" : "";
    toast(place === 1 ? "You won the match!" : "Match complete", {
      description: `Rating ${sign}${delta}`,
    });
  }, [state.result, ownId]);

  if (state.result) {
    return (
      <MatchOver
        ownId={ownId}
        finishPlaceById={state.result.finishPlaceById}
        eloDeltas={state.result.eloDeltas}
        names={names}
        onLeave={onLeave}
      />
    );
  }

  const view = state.view;
  const potTotal = view ? view.seats.reduce((sum, s) => sum + (s?.committedTotal ?? 0), 0) : 0;

  // Whose turn it is, for the idle status strip.
  const actingId =
    view && view.toAct != null && view.toAct !== state.ownSeat
      ? view.seats[view.toAct]?.id
      : undefined;
  const actingName = actingId ? (names[actingId]?.name ?? displayName({ id: actingId })) : null;

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-base bg-noise">
      {/* Header pill cluster */}
      <div className="z-20 flex items-center gap-2 border-b border-edge bg-surface/80 px-3 py-2 backdrop-blur">
        <Logo size={20} />
        {!compact && <span className="font-display text-sm font-semibold text-neutral-100">PokerElo</span>}
        {view && (
          <div className="flex items-center gap-1.5 rounded-full border border-edge bg-surface-2 px-2.5 py-1 text-stat text-xs text-neutral-300">
            <span className="text-emerald">
              {formatChips(view.sb)}/{formatChips(view.bb)}
            </span>
            {!compact && (
              <>
                <span className="text-neutral-600">·</span>
                <span className="text-neutral-400">
                  {blindLevelLabel(view.sb, view.bb, state.matchInfo?.format ?? "")}
                </span>
              </>
            )}
          </div>
        )}
        {state.matchInfo && (
          <MatchClock
            matchStartMs={state.matchInfo.matchStartMs}
            matchDurationMs={state.matchInfo.matchDurationMs}
          />
        )}
        <div className="flex-1" />
        <Button variant="ghost" size="icon-sm" onClick={onLeave} aria-label="Leave match">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>

      {/* Felt */}
      <div className="flex flex-1 items-center justify-center overflow-hidden px-2 py-2">
        <Table state={state} names={names} compact={compact} />
      </div>

      {/* Action zone */}
      {state.turn && view ? (
        <ActionBar
          mask={state.turn.mask}
          currentBet={view.currentBet}
          potTotal={potTotal}
          bb={view.bb}
          compact={compact}
          onAction={sendAction}
        />
      ) : (
        <div className="flex items-center justify-center gap-2 border-t border-edge bg-surface/60 px-4 py-3">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald/70" />
          <span className="text-sm text-neutral-400">
            {actingName ? `Waiting for ${actingName}…` : "Waiting…"}
          </span>
        </div>
      )}
      {state.error && <p className="pb-2 text-center text-sm text-danger">{state.error}</p>}
    </div>
  );
}
