import { useEffect, useRef, useReducer } from "react";
import PartySocket from "partysocket";
import { encode, decode } from "@poker/shared";
import type { ServerMsg } from "@poker/shared";
import { PARTYKIT_HOST } from "../lib/env.js";
import { lobbyReducer, initialLobbyState } from "./lobbyReducer.js";

export function useLobbySocket(getJwt: () => string | null) {
  const [state, dispatch] = useReducer(lobbyReducer, initialLobbyState);
  const sockRef = useRef<PartySocket | null>(null);

  useEffect(() => {
    const socket = new PartySocket({ host: PARTYKIT_HOST, party: "lobby", room: "global" });
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
  }, []);

  function enqueue(rating: number, format: string): void {
    sockRef.current?.send(encode({ t: "enqueue", rating, format }));
  }
  function leave(): void {
    sockRef.current?.send(encode({ t: "leave" }));
  }

  return { state, enqueue, leave };
}
