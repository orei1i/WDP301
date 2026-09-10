import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export type BadgeTone = "emerald" | "amber" | "stone" | "sky" | "rose" | "dark";

const soft: Record<BadgeTone, string> = {
  emerald: "bg-emerald-50 text-emerald-800 ring-emerald-600/15",
  amber: "bg-amber-50 text-amber-800 ring-amber-600/20",
  stone: "bg-stone-100 text-stone-700 ring-stone-500/15",
  sky: "bg-sky-50 text-sky-800 ring-sky-600/15",
  rose: "bg-rose-50 text-rose-700 ring-rose-600/15",
  dark: "bg-stone-900/75 text-white ring-white/10 backdrop-blur-sm",
};

const solid: Record<BadgeTone, string> = {
  emerald: "bg-emerald-600 text-white ring-transparent",
  amber: "bg-amber-400 text-stone-900 ring-transparent",
  stone: "bg-stone-700 text-white ring-transparent",
  sky: "bg-sky-600 text-white ring-transparent",
  rose: "bg-rose-600 text-white ring-transparent",
  dark: "bg-stone-900 text-white ring-transparent",
};

type BadgeProps = ComponentProps<"span"> & {
  tone?: BadgeTone;
  variant?: "soft" | "solid";
  size?: "sm" | "md";
};

export function Badge({ tone = "stone", variant = "soft", size = "sm", className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-medium ring-1 ring-inset [&_svg]:size-3",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        (variant === "solid" ? solid : soft)[tone],
        className,
      )}
      {...props}
    />
  );
}
