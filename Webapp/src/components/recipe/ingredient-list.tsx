"use client";

import { useMemo, useState } from "react";
import { Check, ClipboardCopy, Minus, Plus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatQuantity } from "@/lib/format";
import type { Ingredient } from "@/types";

/** Whole-item units don't scale to "4½ cloves" — round to whole once ≥ 1. */
const COUNTABLE = new Set(["cloves", "stalks", "sprigs", "head", "handful", "handfuls"]);

function scale(i: Ingredient, factor: number): number | null {
  if (i.quantity == null) return null;
  const q = i.quantity * factor;
  const countable = !i.unit || COUNTABLE.has(i.unit);
  return countable && q >= 1 ? Math.round(q) : q;
}

type Props = { ingredients: Ingredient[]; baseServings: number };

/** Checklist with servings scaler. Grouped by `ingredient.group`. */
export function IngredientList({ ingredients, baseServings }: Props) {
  const [servings, setServings] = useState(baseServings);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);
  const factor = servings / baseServings;

  const groups = useMemo(() => {
    const map = new Map<string, Ingredient[]>();
    ingredients.forEach((i) => {
      const k = i.group ?? "";
      map.set(k, [...(map.get(k) ?? []), i]);
    });
    return [...map.entries()];
  }, [ingredients]);

  const toggle = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const label = (i: Ingredient) => [formatQuantity(scale(i, factor)), i.unit].filter(Boolean).join(" ");

  const copy = async () => {
    const text = ingredients
      .filter((i) => !checked.has(i.id))
      .map((i) => `- ${[label(i), i.name].filter(Boolean).join(" ")}${i.note ? ` (${i.note})` : ""}`)
      .join("\n");
    try {
      await navigator.clipboard.writeText(`Shopping list — ${servings} servings\n${text}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked */
    }
  };

  const done = checked.size;
  const total = ingredients.length;

  return (
    <section aria-labelledby="ingredients-heading" className="rounded-3xl bg-white p-5 ring-1 ring-stone-200/80">
      <div className="flex items-center justify-between gap-3">
        <h2 id="ingredients-heading" className="font-display text-lg font-semibold text-stone-900">
          Ingredients
        </h2>
        <div className="flex items-center rounded-full bg-stone-100 p-0.5" role="group" aria-label="Servings">
          <button onClick={() => setServings((s) => Math.max(1, s - 1))} disabled={servings <= 1} className="grid size-7 place-items-center rounded-full text-stone-600 hover:bg-white disabled:opacity-40" aria-label="Fewer servings">
            <Minus className="size-3.5" />
          </button>
          <span className="min-w-[4.5rem] text-center text-xs font-semibold text-stone-800 tabular-nums">{servings} serving{servings > 1 && "s"}</span>
          <button onClick={() => setServings((s) => Math.min(24, s + 1))} className="grid size-7 place-items-center rounded-full text-stone-600 hover:bg-white" aria-label="More servings">
            <Plus className="size-3.5" />
          </button>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-stone-100">
          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${(done / total) * 100}%` }} />
        </div>
        <span className="text-[11px] font-medium text-stone-500 tabular-nums">
          {done}/{total} ready
        </span>
      </div>

      <div className="mt-4 space-y-4">
        {groups.map(([group, items]) => (
          <div key={group || "_"}>
            {group && <p className="mb-1.5 text-[11px] font-semibold tracking-wider text-emerald-700 uppercase">{group}</p>}
            <ul className="divide-y divide-stone-100">
              {items.map((i) => {
                const on = checked.has(i.id);
                return (
                  <li key={i.id}>
                    <label className="flex cursor-pointer items-start gap-3 py-2.5">
                      <input type="checkbox" checked={on} onChange={() => toggle(i.id)} className="peer sr-only" />
                      <span
                        aria-hidden
                        className={cn(
                          "mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border-2 transition peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-500",
                          on ? "border-emerald-600 bg-emerald-600 text-white" : "border-stone-300 bg-white",
                        )}
                      >
                        {on && <Check className="size-3.5" strokeWidth={3} />}
                      </span>
                      <span className={cn("flex-1 text-sm leading-snug transition", on ? "text-stone-400 line-through" : "text-stone-700")}>
                        <span className="font-medium text-stone-900 empty:hidden">{label(i)}</span> {i.name}
                        {i.optional && <span className="ml-1 text-xs text-stone-400">(optional)</span>}
                        {i.note && <span className="block text-xs text-stone-400">{i.note}</span>}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="mt-4 flex gap-2">
        <Button variant="secondary" size="sm" className="flex-1" onClick={copy}>
          {copied ? <Check /> : <ClipboardCopy />} {copied ? "Copied!" : "Copy shopping list"}
        </Button>
        {(done > 0 || servings !== baseServings) && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Reset"
            onClick={() => {
              setChecked(new Set());
              setServings(baseServings);
            }}
          >
            <RotateCcw />
          </Button>
        )}
      </div>
    </section>
  );
}
