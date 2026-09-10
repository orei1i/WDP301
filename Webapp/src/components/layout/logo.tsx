import Link from "next/link";
import { Leaf } from "lucide-react";
import { cn } from "@/lib/cn";

export function Logo({ className, compact = false, tone = "dark" }: { className?: string; compact?: boolean; tone?: "dark" | "light" }) {
  return (
    <Link href="/" className={cn("group inline-flex items-center gap-2", className)} aria-label="VeggieHub home">
      <span className="grid size-9 place-items-center rounded-xl bg-emerald-600 text-white shadow-sm shadow-emerald-900/20 transition group-hover:rotate-[-8deg]">
        <Leaf className="size-5" strokeWidth={2.25} />
      </span>
      {!compact && (
        <span className={cn("font-display text-xl font-semibold tracking-tight", tone === "light" ? "text-white" : "text-stone-900")}>
          Veggie<span className={tone === "light" ? "text-amber-300" : "text-emerald-700"}>Hub</span>
        </span>
      )}
    </Link>
  );
}
