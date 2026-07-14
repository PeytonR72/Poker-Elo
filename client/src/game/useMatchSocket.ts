import { useEffect, useRef, useReducer } from "react";
import PartySocket from "partysocket";
import { encode, decode } from "@poker/shared";
import type { ServerMsg } from "@poker/shared";
import { PARTYKIT_HOST } from "../lib/env.js";
import { matchReducer, initialMatchState } from "./matchReducer.js";

type ActionType = "fold" | "check" | "call" | "raise";

// UI-only pacing (not a poker rule): hold the last action's badge on screen briefly
// before revealing the next street's card(s), instead of jump-cutting straight to it.
const POST_STREET_PAUSE_MS = 1_500;

export function useMatchSocket(roomId: string, getJwt: () => string | null) {
  const [state, dispatch] = useReducer(matchReducer, initialMatchState);
  const sockRef = useRef<PartySocket | null>(null);
  const seatRef = useRef<number | null>(null);
  const readyAtRef = useRef(0);
  seatRef.current = state.ownSeat;

  useEffect(() => {
    const socket = new PartySocket({ host: PARTYKIT_HOST, party: "main", room: roomId });
    sockRef.current = socket;
    readyAtRef.current = 0;
    socket.addEventListener("open", () => {
      const jwt = getJwt();
      if (jwt) socket.send(encode({ t: "hello", jwt }));
    });
    socket.addEventListener("message", (e: MessageEvent) => {
      const msg = decode<ServerMsg>(e.data as string);
      const now = Date.now();
      const isStreet = msg.t === "event" && msg.event.type === "street";
      const baseRunAt = Math.max(now, readyAtRef.current);
      // The street event itself (which clears the action badges) is delayed so the
      // call/raise that ended the betting round stays visible for a beat; everything
      // after it inherits the same delay, keeping order.
      const runAt = isStreet ? baseRunAt + POST_STREET_PAUSE_MS : baseRunAt;
      const wait = runAt - now;
      if (wait <= 0) dispatch(msg);
      else setTimeout(() => dispatch(msg), wait);
      readyAtRef.current = runAt;
    });
    return () => socket.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  function sendAction(action: ActionType, amount?: number): void {
    const seat = seatRef.current;
    if (seat === null) return;
    sockRef.current?.send(encode({ t: "action", seat, action, amount }));
  }

  return { state, sendAction };
}
