import { useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { Play, Trophy, User, LogOut, Menu } from "lucide-react";
import { rankForRating } from "@poker/shared";
import { Button } from "../components/ui/button.js";
import { Sheet, SheetContent, SheetTrigger } from "../components/ui/sheet.js";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/ui/tooltip.js";
import { TierAvatar } from "../components/tier-avatar.js";
import { DotGrid } from "../assets/decor/index.js";
import Logo from "./Logo.js";

export type ShellTab = "play" | "leaderboard" | "profile";

const NAV: { tab: ShellTab; label: string; Icon: typeof Play }[] = [
  { tab: "play", label: "Play Now", Icon: Play },
  { tab: "leaderboard", label: "Leaderboards", Icon: Trophy },
  { tab: "profile", label: "Profile", Icon: User },
];

function SidebarBody(props: {
  tab: ShellTab;
  onTabChange: (t: ShellTab) => void;
  onFindMatch: () => void;
  rating: number;
  username: string;
  userId: string;
  onSignOut: () => void;
}) {
  const tier = rankForRating(props.rating);
  return (
    <div className="relative h-full">
      <DotGrid gap={26} className="opacity-50" />
      <div className="relative z-10 flex h-full flex-col gap-4 p-4">
        <div className="flex items-center gap-2">
          <Logo size={30} />
          <span className="text-lg font-bold">
            Poker<span className="text-emerald">Elo</span>
          </span>
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex cursor-default items-center gap-3 rounded-xl border border-edge bg-surface-2 p-3">
              <TierAvatar
                seed={props.userId}
                rating={props.rating}
                name={props.username}
                size={40}
              />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{props.username || "Player"}</div>
                <div className="font-mono-num text-xs text-muted-foreground">
                  {tier} | {props.rating}
                </div>
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent side="right">
            Rating {props.rating} · {tier} — win rated matches to climb
          </TooltipContent>
        </Tooltip>

        <Button
          className="shadow-[0_0_18px_rgba(47,217,135,0.45)] font-semibold"
          onClick={props.onFindMatch}
        >
          Find Match
        </Button>

        <nav className="flex flex-col gap-1">
          {NAV.map(({ tab, label, Icon }) => {
            const active = props.tab === tab;
            return (
              <button
                key={tab}
                onClick={() => props.onTabChange(tab)}
                className={`group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors duration-150 ${
                  active
                    ? "bg-surface-2 text-emerald"
                    : "text-neutral-400 hover:bg-surface-2/50 hover:text-neutral-100"
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="nav-rail"
                    className="absolute left-0 top-1 bottom-1 w-0.5 rounded bg-emerald"
                  />
                )}
                <Icon
                  size={16}
                  className="transition-transform duration-150 group-hover:translate-x-0.5"
                />
                {label}
              </button>
            );
          })}
        </nav>

        <div className="mt-auto border-t border-edge pt-3">
          <button
            onClick={props.onSignOut}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-neutral-400 transition-colors duration-150 hover:bg-danger/10 hover:text-danger"
          >
            <LogOut size={16} /> Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AppShell(props: Parameters<typeof SidebarBody>[0] & { children: ReactNode }) {
  const { children, ...side } = props;
  const [sheetOpen, setSheetOpen] = useState(false);
  // Inside the mobile sheet, any nav/action tap should also close the drawer.
  const sheetSide: typeof side = {
    ...side,
    onTabChange: (t) => {
      setSheetOpen(false);
      side.onTabChange(t);
    },
    onFindMatch: () => {
      setSheetOpen(false);
      side.onFindMatch();
    },
    onSignOut: () => {
      setSheetOpen(false);
      side.onSignOut();
    },
  };
  return (
    <div className="flex min-h-screen bg-base">
      <aside className="hidden w-60 shrink-0 border-r border-edge bg-surface md:block">
        <SidebarBody {...side} />
      </aside>
      <div className="relative flex-1 bg-noise bg-vignette">
        <div className="relative z-10 flex items-center gap-2 border-b border-edge p-3 md:hidden">
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <Button variant="secondary" size="icon" aria-label="Menu">
                <Menu size={18} />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 bg-surface p-0">
              <SidebarBody {...sheetSide} />
            </SheetContent>
          </Sheet>
          <Logo size={24} />
          <span className="font-bold">
            Poker<span className="text-emerald">Elo</span>
          </span>
        </div>
        <main className="relative z-10 mx-auto max-w-4xl p-6">{children}</main>
      </div>
    </div>
  );
}
