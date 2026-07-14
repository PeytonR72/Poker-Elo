import { routePartykitRequest } from "partyserver";
import MatchRoom from "./matchRoom.js";
import Lobby from "./lobby.js";
import type { Env } from "./env.js";

export { MatchRoom, Lobby };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const response = await routePartykitRequest(request, env);
    return response ?? new Response("Not found", { status: 404 });
  },
};
