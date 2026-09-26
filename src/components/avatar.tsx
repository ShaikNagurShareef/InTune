const TONES = [
  "bg-teal-soft text-teal",
  "bg-clay-soft text-clay",
  "bg-sage-soft text-sage",
  "bg-amber-soft text-amber-ink",
];

function toneFor(seed: string): string {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length];
}

/** Initial-letter avatar; group circles get a rounded square so they read differently from people. */
export function Avatar({ name, seed, group = false, size = "md" }: { name: string; seed: string; group?: boolean; size?: "sm" | "md" }) {
  const dims = size === "sm" ? "h-9 w-9 text-base" : "h-12 w-12 text-xl";
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center font-display font-semibold ${dims} ${group ? "rounded-2xl" : "rounded-full"} ${toneFor(seed)}`}
    >
      {name.trim().slice(0, 1).toUpperCase() || "?"}
    </span>
  );
}
