import Image from "next/image";
import { BadgeCheck } from "lucide-react";
import { cn } from "@/lib/cn";
import { initials } from "@/lib/format";

const PALETTE = [
  "bg-emerald-100 text-emerald-800",
  "bg-amber-100 text-amber-800",
  "bg-lime-100 text-lime-800",
  "bg-orange-100 text-orange-800",
  "bg-teal-100 text-teal-800",
  "bg-stone-200 text-stone-700",
];

const SIZES = { xs: "size-6 text-[10px]", sm: "size-8 text-xs", md: "size-10 text-sm", lg: "size-14 text-base" } as const;

function hash(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}

type AvatarProps = {
  name: string;
  src?: string;
  size?: keyof typeof SIZES;
  verified?: boolean;
  className?: string;
};

export function Avatar({ name, src, size = "md", verified, className }: AvatarProps) {
  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <span
        className={cn(
          "inline-flex items-center justify-center overflow-hidden rounded-full font-semibold ring-2 ring-white",
          SIZES[size],
          !src && PALETTE[hash(name) % PALETTE.length],
        )}
        aria-label={name}
      >
        {src ? <Image src={src} alt={name} fill sizes="56px" className="object-cover" /> : initials(name)}
      </span>
      {verified && (
        <BadgeCheck
          aria-label="Verified"
          className="absolute -right-1 -bottom-1 size-3.5 rounded-full bg-white fill-emerald-600 text-white"
        />
      )}
    </span>
  );
}

/** Overlapping stack of avatars, e.g. forum thread participants. */
export function AvatarStack({ people, max = 3 }: { people: { name: string; avatarUrl?: string }[]; max?: number }) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <div className="flex -space-x-2">
      {shown.map((p) => (
        <Avatar key={p.name} name={p.name} src={p.avatarUrl} size="xs" />
      ))}
      {rest > 0 && (
        <span className="inline-flex size-6 items-center justify-center rounded-full bg-stone-100 text-[10px] font-semibold text-stone-600 ring-2 ring-white">
          +{rest}
        </span>
      )}
    </div>
  );
}
