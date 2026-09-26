"use client";

import { useEffect, useRef, useState } from "react";
import { MoreHorizontal, type LucideIcon } from "lucide-react";

const MENU_HEIGHT_PX = 260;

export interface MenuAction {
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  danger?: boolean;
}

/** Small "more" menu: button with aria-expanded, Escape / outside click to close, items as buttons. */
export function ActionMenu({ label, actions, align = "left" }: { label: string; actions: MenuAction[]; align?: "left" | "right" }) {
  const [isOpen, setIsOpen] = useState(false);
  const [openUp, setOpenUp] = useState(true);
  const ref = useRef<HTMLDivElement | null>(null);

  const toggle = () => {
    if (!isOpen && ref.current) {
      // Open upward only when there is room above; otherwise open downward (e.g. the first message in a chat).
      const scroller = ref.current.closest("section") ?? document.body;
      const roomAbove = ref.current.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
      setOpenUp(roomAbove > MENU_HEIGHT_PX);
    }
    setIsOpen((v) => !v);
  };
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setIsOpen(false);
    const onClick = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setIsOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [isOpen]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={toggle}
        className="grid h-10 w-10 place-items-center rounded-full text-ink-2 transition hover:bg-paper-2 hover:text-ink"
      >
        <MoreHorizontal aria-hidden="true" className="h-5 w-5" />
      </button>
      {isOpen && (
        <ul
          role="menu"
          className={`absolute z-30 w-52 ${openUp ? "bottom-full mb-1" : "top-full mt-1"} rounded-2xl border border-line bg-card p-1.5 shadow-[var(--shadow-lg)] ${align === "right" ? "right-0" : "left-0"}`}
        >
          {actions.map((a) => (
            <li key={a.label} role="none">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setIsOpen(false);
                  a.onSelect();
                }}
                className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold hover:bg-paper-2 ${a.danger ? "text-clay" : ""}`}
              >
                <a.icon aria-hidden="true" className="h-4 w-4" />
                {a.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
