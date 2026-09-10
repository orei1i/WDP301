"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import type { Recipe } from "@/types";
import { IngredientList } from "./ingredient-list";
import { StepList } from "./step-list";

/**
 * Ingredients + steps.
 * < md: segmented tabs (Kitchen-Stories style). md+: side-by-side, ingredients sticky.
 */
export function RecipeBody({ recipe }: { recipe: Recipe }) {
  const [tab, setTab] = useState<"ingredients" | "steps">("ingredients");

  return (
    <div>
      <div role="tablist" className="sticky top-16 z-20 -mx-4 mb-4 grid grid-cols-2 border-b border-stone-200 bg-stone-50/95 px-4 backdrop-blur md:hidden">
        {(["ingredients", "steps"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn(
              "relative py-3 text-sm font-semibold capitalize",
              tab === t ? "text-emerald-800 after:absolute after:inset-x-6 after:-bottom-px after:h-0.5 after:rounded-full after:bg-emerald-600" : "text-stone-500",
            )}
          >
            {t === "ingredients" ? `Ingredients (${recipe.ingredients.length})` : `Steps (${recipe.steps.length})`}
          </button>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-[minmax(260px,320px)_minmax(0,1fr)] md:items-start">
        <div className={cn("md:sticky md:top-20", tab !== "ingredients" && "max-md:hidden")}>
          <IngredientList ingredients={recipe.ingredients} baseServings={recipe.servings} />
        </div>
        <div className={cn(tab !== "steps" && "max-md:hidden")}>
          <StepList />
        </div>
      </div>
    </div>
  );
}
