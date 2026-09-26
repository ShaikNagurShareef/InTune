import { Users } from "lucide-react";
import { statusInfo } from "@/lib/social";

const TONES = [
  "from-[#4f5bd5] to-[#962fbf]",
  "from-[#962fbf] to-[#d62976]",
  "from-[#fa7e1e] to-[#d62976]",
  "from-[#1f9d8f] to-[#4f5bd5]",
  "from-[#f2a93b] to-[#fa7e1e]",
];

function toneFor(seed: string): string {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length];
}

const SIZES = {
  xs: "h-7 w-7 text-xs",
  sm: "h-10 w-10 text-sm",
  md: "h-14 w-14 text-lg",
  lg: "h-20 w-20 text-2xl",
  xl: "h-28 w-28 text-4xl",
} as const;

interface AvatarProps {
  name: string;
  seed: string;
  group?: boolean;
  size?: keyof typeof SIZES;
  /** Story-style gradient ring, used for unread activity. */
  ring?: boolean;
  status?: string | null;
}

/** Initials avatar with a stable gradient per person; circles show a group glyph badge. */
export function Avatar({ name, seed, group = false, size = "md", ring = false, status }: AvatarProps) {
  const s = statusInfo(status ?? "none");
  const face = (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-full bg-gradient-to-br font-extrabold text-white ${SIZES[size]} ${toneFor(seed)}`}
    >
      {name.trim().slice(0, 1).toUpperCase() || "?"}
    </span>
  );
  return (
    <span className="relative inline-flex shrink-0">
      {ring ? (
        <span className="ring-story rounded-full p-[2.5px]">
          <span className="block rounded-full bg-paper p-[2px]">{face}</span>
        </span>
      ) : (
        face
      )}
      {group && (
        <span aria-hidden="true" className="absolute -bottom-0.5 -right-0.5 grid h-5 w-5 place-items-center rounded-full border-2 border-paper bg-ink text-paper">
          <Users className="h-2.5 w-2.5" strokeWidth={3} />
        </span>
      )}
      {!group && s.id !== "none" && (
        <span
          aria-hidden="true"
          title={s.label}
          className="absolute -bottom-1 -right-1 grid h-6 w-6 place-items-center rounded-full border-2 border-paper bg-amber-soft text-xs"
        >
          {s.icon}
        </span>
      )}
    </span>
  );
}
