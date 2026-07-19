// Dev-only visual harness for Phase 3 assets. Not part of the app bundle:
// only reachable via /asset-preview.html under `vite dev`.
import type React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { PlayingCard } from "./components/playing-card.js";
import { cardIntToProps } from "./assets/cards/cardMap.js";
import { PokerChip, ChipStack } from "./components/poker-chip.js";
import { DealerButton } from "./components/dealer-button.js";
import { SpadeWatermark, DotGrid, EmptyLeaderboard, NoMatches, GenericError } from "./assets/decor/index.js";
import { TierAvatar } from "./components/tier-avatar.js";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="text-h2 mb-4 font-display">{title}</h2>
      <div className="flex flex-wrap items-end gap-3">{children}</div>
    </section>
  );
}

function App() {
  return (
    <div className="min-h-screen bg-base p-10 text-neutral-200">
      <h1 className="text-display mb-8 font-display">Asset preview</h1>
      <Section title="Full deck (engine ints 0–51)">
        {Array.from({ length: 52 }, (_, c) => (
          <PlayingCard key={c} {...cardIntToProps(c)} className="h-20" />
        ))}
      </Section>
      <Section title="Card back + hero size">
        <PlayingCard rank="A" suit="s" className="h-24" />
        <PlayingCard rank="T" suit="h" className="h-24" />
        <PlayingCard rank="Q" suit="d" className="h-24" />
        <PlayingCard rank="7" suit="c" className="h-24" />
        <PlayingCard rank="A" suit="s" faceDown className="h-24" />
        <PlayingCard rank="A" suit="s" faceDown className="h-14" />
      </Section>
      <Section title="Chips">
        <PokerChip value={5} />
        <PokerChip value={25} />
        <PokerChip value={100} />
        <PokerChip value={500} />
        <ChipStack amount={735} />
        <ChipStack amount={60} />
        <ChipStack amount={2500} />
        <DealerButton />
      </Section>
      <Section title="Decor">
        <div className="relative h-40 w-64 overflow-hidden rounded-xl border border-edge bg-surface">
          <SpadeWatermark className="absolute inset-0 m-auto h-32 w-32" />
        </div>
        <div className="relative h-40 w-64 overflow-hidden rounded-xl border border-edge bg-surface">
          <DotGrid className="absolute inset-0" />
        </div>
        <EmptyLeaderboard className="h-24 w-24" />
        <NoMatches className="h-24 w-24" />
        <GenericError className="h-24 w-24" />
      </Section>
      <Section title="Tier avatars (400 → 2200)">
        {[400, 800, 1100, 1400, 1700, 2200].map((r) => (
          <TierAvatar key={r} seed={`preview-${r}`} rating={r} size={56} />
        ))}
      </Section>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
