import type { ReactNode } from "react";
import { motion } from "motion/react";
import { Play, Trophy, User, LogOut, Menu } from "lucide-react";
import { rankForRating } from "@poker/shared";
import { Button } from "../components/ui/button.js";
import { Sheet, SheetContent, SheetTrigger } from "../components/ui/sheet.js";
import Logo from "./Logo.js";
import { avatarUrl } from "../data/avatar.js";

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
  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="flex items-center gap-2">
        <Logo size={30} />
        <span className="text-lg font-bold">
          Poker<span className="text-emerald">Elo</span>
        </span>
      </div>
      <div className="flex items-center gap-3 rounded-xl border border-edge bg-surface-2 p-3">
        <img src={avatarUrl(props.userId)} alt="" className="h-10 w-10 rounded-lg" />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{props.username}</div>
          <div className="font-mono-num text-xs text-muted-foreground">
            {rankForRating(props.rating)} | {props.rating}
          </div>
        </div>
      </div>
      <Button
        className="shadow-[0_0_18px_rgba(47,217,135,0.45)] font-semibold"
        onClick={props.onFindMatch}
      >
        Find Match
      </Button>
      <nav className="flex flex-col gap-1">
        {NAV.map(({ tab, label, Icon }) => (
          <button
            key={tab}
            onClick={() => props.onTabChange(tab)}
            className={`relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
              props.tab === tab ? "bg-surface-2 text-emerald" : "text-neutral-400 hover:text-neutral-100"
            }`}
          >
            {props.tab === tab && (
              <motion.span layoutId="nav-rail" className="absolute left-0 top-1 bottom-1 w-0.5 rounded bg-emerald" />
            )}
            <Icon size={16} /> {label}
          </button>
        ))}
      </nav>
      <div className="mt-auto border-t border-edge pt-3">
        <button onClick={props.onSignOut} className="flex items-center gap-2 text-sm text-neutral-400 hover:text-danger">
          <LogOut size={16} /> Sign Out
        </button>
      </div>
    </div>
  );
}

export default function AppShell(props: Parameters<typeof SidebarBody>[0] & { children: ReactNode }) {
  const { children, ...side } = props;
  return (
    <div className="flex min-h-screen bg-base">
      <aside className="hidden w-60 shrink-0 border-r border-edge bg-surface md:block">
        <SidebarBody {...side} />
      </aside>
      <div className="relative flex-1 bg-noise bg-vignette">
        <div className="relative z-10 flex items-center gap-2 border-b border-edge p-3 md:hidden">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="secondary" size="icon" aria-label="Menu">
                <Menu size={18} />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 bg-surface p-0">
              <SidebarBody {...side} />
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
