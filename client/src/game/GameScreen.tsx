import { LogOut } from "lucide-react";
import { useMatchSocket } from "./useMatchSocket.js";
import Table from "./Table.js";
import ActionBar from "./ActionBar.js";
import MatchClock from "./MatchClock.js";
import MatchOver from "./MatchOver.js";
import Logo from "../shell/Logo.js";
import { Badge } from "../components/ui/badge.js";
import { Button } from "../components/ui/button.js";
import { blindLevelLabel } from "./viewHelpers.js";

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

  if (state.result) {
    return (
      <MatchOver
        ownId={ownId}
        finishPlaceById={state.result.finishPlaceById}
        eloDeltas={state.result.eloDeltas}
        onLeave={onLeave}
      />
    );
  }

  const view = state.view;
  // The live pot during a hand is the sum of every seat's committedTotal (view.pots is
  // only ever transiently populated inside settleShowdown) — computed once here so
  // Table/Board and ActionBar's pot-relative presets agree on the same number.
  const potTotal = view ? view.seats.reduce((sum, s) => sum + (s?.committedTotal ?? 0), 0) : 0;

  return (
    <div className="flex h-screen flex-col bg-base">
      <div className="flex items-center gap-3 border-b border-edge bg-surface px-4 py-2">
        <Logo size={22} />
        <span className="text-sm font-semibold text-neutral-200">PokerElo</span>
        {view && (
          <Badge variant="secondary" className="font-mono-num">
            Blinds: {view.sb}/{view.bb} · {blindLevelLabel(view.sb, view.bb, state.matchInfo?.format ?? "")}
          </Badge>
        )}
        {state.matchInfo && view && (
          <MatchClock
            matchStartMs={state.matchInfo.matchStartMs}
            matchDurationMs={state.matchInfo.matchDurationMs}
            format={state.matchInfo.format}
            sb={view.sb}
            bb={view.bb}
          />
        )}
        <div className="flex-1" />
        <Button variant="ghost" size="icon-sm" onClick={onLeave} aria-label="Leave match">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex flex-1 items-center justify-center overflow-hidden">
        <Table state={state} />
      </div>

      {state.turn ? (
        <ActionBar
          mask={state.turn.mask}
          currentBet={view?.currentBet ?? 0}
          potTotal={potTotal}
          bb={view?.bb ?? 1}
          onAction={sendAction}
        />
      ) : (
        <div className="border-t border-edge bg-surface px-4 py-3 text-center text-sm text-neutral-500">Waiting…</div>
      )}
      {state.error && <p className="pb-2 text-center text-sm text-danger">{state.error}</p>}
    </div>
  );
}
