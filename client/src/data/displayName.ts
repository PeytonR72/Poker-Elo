import { personaForSeatId } from "@poker/shared";

export function displayName(p: { id: string; username?: string | null }): string {
  if (p.id.startsWith("bot-")) return `🤖 ${personaForSeatId(p.id).name}`;
  const u = p.username?.trim();
  return u && u.length > 0 ? u : `player_${p.id.slice(0, 8)}`;
}
