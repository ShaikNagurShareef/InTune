"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleUser, Flag, Info, KeyRound, MessageCircle, SquarePen, type LucideIcon } from "lucide-react";

interface Item {
  href: string;
  label: string;
  icon: LucideIcon;
  match: (path: string) => boolean;
}

const PRIMARY: Item[] = [
  { href: "/circles", label: "Chats", icon: MessageCircle, match: (p) => p.startsWith("/circles") && !p.includes("new=") },
  { href: "/circles?new=1", label: "New", icon: SquarePen, match: () => false },
  { href: "/me", label: "Profile", icon: CircleUser, match: (p) => p.startsWith("/me") },
  { href: "/settings", label: "Gemini key", icon: KeyRound, match: (p) => p.startsWith("/settings") },
];

const SECONDARY: Item[] = [
  { href: "/moderation", label: "Reports", icon: Flag, match: (p) => p.startsWith("/moderation") },
  { href: "/about", label: "About InTune", icon: Info, match: (p) => p.startsWith("/about") },
];

function Badge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-teal px-1 text-[11px] font-bold text-on-brand">
      {count}
      <span className="sr-only"> invitation{count === 1 ? "" : "s"}</span>
    </span>
  );
}

/** Desktop side rail, Instagram-style: icons on md, icons + labels on xl. */
export function SideNav({ invitations }: { invitations: number }) {
  const path = usePathname();
  const render = (item: Item) => {
    const active = item.match(path);
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={`group flex min-h-12 items-center gap-4 rounded-xl px-3 transition hover:bg-paper-2 ${active ? "font-extrabold" : "font-medium"}`}
      >
        <span className="relative">
          <Icon aria-hidden="true" className="h-6 w-6 transition group-hover:scale-105" strokeWidth={active ? 2.6 : 2} />
          {item.href === "/circles" && <Badge count={invitations} />}
        </span>
        <span className="hidden xl:inline">{item.label}</span>
        <span className="sr-only xl:hidden">{item.label}</span>
      </Link>
    );
  };
  return (
    <>
      <nav aria-label="Main" className="flex flex-col gap-1">{PRIMARY.map(render)}</nav>
      <nav aria-label="More" className="mt-auto flex flex-col gap-1">{SECONDARY.map(render)}</nav>
    </>
  );
}

/** Phone bottom tab bar. */
export function BottomTabs({ invitations }: { invitations: number }) {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="grid h-16 grid-cols-4 border-t border-line bg-paper/95 backdrop-blur">
      {PRIMARY.map((item) => {
        const active = item.match(path);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className="flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold"
          >
            <span className="relative">
              <Icon aria-hidden="true" className="h-6 w-6" strokeWidth={active ? 2.6 : 2} />
              {item.href === "/circles" && <Badge count={invitations} />}
            </span>
            <span className={active ? "text-ink" : "text-ink-2"}>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
