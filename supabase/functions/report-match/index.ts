import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

interface ReportMatchPayload {
  roomId: string;
  format: string;
  finishPlaceById: Record<string, number>;
  eloDeltas: Record<string, number>;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (!SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: "server_misconfigured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const auth = req.headers.get("Authorization") ?? "";
  if (auth !== `Bearer ${SERVICE_ROLE_KEY}`) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let payload: ReportMatchPayload;
  try {
    payload = await req.json() as ReportMatchPayload;
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { roomId, format, finishPlaceById, eloDeltas } = payload;
  if (!roomId || !format || !finishPlaceById || !eloDeltas) {
    return new Response(JSON.stringify({ error: "missing_fields" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: matchRow, error: matchErr } = await supabase
    .from("matches")
    .insert({ room_id: roomId, format })
    .select("id")
    .single();

  if (matchErr || !matchRow) {
    console.error("matches insert error:", matchErr);
    return new Response(
      JSON.stringify({ error: "db_error", detail: matchErr?.message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const matchId: string = (matchRow as { id: string }).id;
  const playerIds = Object.keys(finishPlaceById).filter(id => !id.startsWith("bot-"));
  const failedPlayerIds: string[] = [];

  for (const playerId of playerIds) {
    const delta = eloDeltas[playerId] ?? 0;
    const place = finishPlaceById[playerId] ?? 0;

    // Ensure profile row exists
    const { error: upsertErr } = await supabase
      .from("profiles")
      .upsert({ id: playerId }, { onConflict: "id", ignoreDuplicates: true });
    if (upsertErr) {
      console.error(`profile upsert error for ${playerId}:`, upsertErr);
    }

    // Atomically update rating + games_played, get new rating
    const { data: newRating, error: rpcErr } = await supabase
      .rpc("increment_rating", { p_player_id: playerId, p_delta: delta });

    if (rpcErr) {
      console.error(`increment_rating error for ${playerId}:`, rpcErr);
      failedPlayerIds.push(playerId);
      continue;
    }

    const ratingAfter = newRating as number;

    const { error: resultErr } = await supabase
      .from("match_results")
      .insert({
        match_id: matchId,
        player_id: playerId,
        finish_place: place,
        elo_delta: delta,
        rating_after: ratingAfter,
      });

    if (resultErr) {
      console.error(`match_results insert error for ${playerId}:`, resultErr);
    }
  }

  if (failedPlayerIds.length > 0) {
    return new Response(JSON.stringify({ ok: false, matchId, failedPlayerIds }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
  return new Response(JSON.stringify({ ok: true, matchId }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
