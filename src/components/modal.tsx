"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/** Accessible modal: labelled dialog, Escape closes, focus moves in and returns on close; bottom sheet on phones. */
export function Modal({ title, onClose, children }: ModalProps) {
  const panel = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const first = panel.current?.querySelector<HTMLElement>("input, button:not([data-close]), [tabindex]");
    first?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
        className="max-h-[90dvh] w-full overflow-hidden rounded-t-3xl bg-card shadow-[var(--shadow-lg)] sm:max-w-md sm:rounded-3xl"
      >
        <header className="relative flex h-14 items-center justify-center border-b border-line">
          <h2 className="font-extrabold">{title}</h2>
          <button
            type="button"
            data-close
            onClick={onClose}
            aria-label="Close"
            className="absolute right-2 grid h-11 w-11 place-items-center rounded-full hover:bg-paper-2"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </header>
        <div className="max-h-[calc(90dvh-3.5rem)] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
