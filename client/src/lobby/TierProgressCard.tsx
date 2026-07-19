import { Card } from "../components/ui/card.js";
import { Progress } from "../components/ui/progress.js";
import TierAvatar from "../components/tier-avatar.js";
import { tierProgress } from "../data/arenaTier.js";

export default function TierProgressCard({
  rating,
  seed,
  name,
}: {
  rating: number;
  seed: string;
  name?: string;
}) {
  const p = tierProgress(rating);

  return (
    <Card className="gap-3 p-4">
      <h3 className="text-label-caps text-muted-foreground">Current Tier</h3>

      <div className="flex items-center gap-3">
        <TierAvatar seed={seed} rating={rating} name={name} size={44} />
        <div className="flex flex-col">
          <span className="text-h2">{p.tier}</span>
          {p.isTopTier ? (
            <span className="text-xs font-medium text-gold">Top tier reached</span>
          ) : (
            <span className="text-xs text-muted-foreground">
              {p.pointsToNext} pts to {p.nextTier}
            </span>
          )}
        </div>
      </div>

      {p.isTopTier ? (
        <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full w-full rounded-full bg-gold"
            style={{ boxShadow: "var(--shadow-glow-gold)" }}
          />
        </div>
      ) : (
        <Progress value={p.percent} />
      )}
    </Card>
  );
}
