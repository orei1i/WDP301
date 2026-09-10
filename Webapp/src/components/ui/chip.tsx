import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

type ChipProps = ComponentProps<"button"> & { active?: boolean; size?: "sm" | "md" };

/** Toggleable filter pill. Controlled via `active`. */
export function Chip({ active, size = "md", className, type = "button", ...props }: ChipProps) {
  return (
    <button
      type={type}
      aria-pressed={active}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border font-medium transition-colors [&_svg]:size-3.5",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500",
        size === "sm" ? "h-7 px-3 text-xs" : "h-9 px-4 text-sm",
        active
          ? "border-emerald-700 bg-emerald-700 text-white"
          : "border-stone-200 bg-white text-stone-700 hover:border-stone-300 hover:bg-stone-50",
        className,
      )}
      {...props}
    />
  );
}
