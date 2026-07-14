import type { DurableObjectNamespace } from "@cloudflare/workers-types";
import type MatchRoom from "./matchRoom.js";
import type Lobby from "./lobby.js";

export interface Env {
  [key: string]: unknown;
  MAIN: DurableObjectNamespace<MatchRoom>;
  LOBBY: DurableObjectNamespace<Lobby>;
  SUPABASE_URL?: string;
  SUPABASE_JWT_SECRET?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  DEV_TOKENS?: string;
}
