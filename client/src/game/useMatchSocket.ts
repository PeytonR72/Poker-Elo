import { useEffect, useRef, useReducer } from "react";
import PartySocket from "partysocket";
import { encode, decode } from "@poker/shared";
import type { ServerMsg } from "@poker/shared";
import { PARTYKIT_HOST } from "../lib/env.js";
import { matchReducer, initialMatchState } from "./matchReducer.js";

type ActionType = "fold" | "check" | "call" | "raise";

export function useMatchSocket(roomId: string, getJwt: () => string | null) {
  const [state, dispatch] = useReducer(matchReducer, initialMatchState);
  const sockRef = useRef<PartySocket | null>(null);
  const seatRef = useRef<number | null>(null);
  seatRef.current = state.ownSeat;

  useEffect(() => {
    const socket = new PartySocket({ host: PARTYKIT_HOST, party: "main", room: roomId });
    sockRef.current = socket;
    socket.addEventListener("open", () => {
      const jwt = getJwt();
      if (jwt) socket.send(encode({ t: "hello", jwt }));
    });
    socket.addEventListener("message", (e: MessageEvent) => {
      dispatch(decode<ServerMsg>(e.data as string));
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
