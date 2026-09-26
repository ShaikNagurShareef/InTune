import { AudioWaveform } from "lucide-react";

/** Wordmark with the brand gradient; the dot echoes a message bubble. */
export function Logo({ size = "md" }: { size?: "md" | "lg" }) {
  return (
    <span className={`inline-flex items-center gap-2 font-extrabold tracking-tight ${size === "lg" ? "text-4xl" : "text-2xl"}`}>
      <span aria-hidden="true" className={`bg-brand grid place-items-center rounded-[30%] text-on-brand shadow-[var(--shadow)] ${size === "lg" ? "h-11 w-11" : "h-8 w-8"}`}>
        <AudioWaveform className={size === "lg" ? "h-6 w-6" : "h-4.5 w-4.5"} strokeWidth={2.4} />
      </span>
      <span className="text-brand">InTune</span>
    </span>
  );
}
