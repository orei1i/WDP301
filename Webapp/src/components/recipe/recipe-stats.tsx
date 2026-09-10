import { ChefHat, Clock, CookingPot, Flame, UsersRound, Utensils } from "lucide-react";
import type { Recipe } from "@/types";

export function RecipeStats({ recipe }: { recipe: Recipe }) {
  const items = [
    { icon: Clock, label: "Total", value: `${recipe.prepMinutes + recipe.cookMinutes} min` },
    { icon: Utensils, label: "Prep", value: `${recipe.prepMinutes} min` },
    { icon: CookingPot, label: "Cook", value: recipe.cookMinutes ? `${recipe.cookMinutes} min` : "No-cook" },
    { icon: ChefHat, label: "Level", value: recipe.difficulty[0]!.toUpperCase() + recipe.difficulty.slice(1) },
    { icon: UsersRound, label: "Serves", value: String(recipe.servings) },
    ...(recipe.nutrition ? [{ icon: Flame, label: "Per serving", value: `${recipe.nutrition.calories} kcal` }] : []),
  ];
  return (
    <dl className="grid grid-cols-3 gap-2 sm:grid-cols-6">
      {items.map(({ icon: Icon, label, value }) => (
        <div key={label} className="rounded-2xl bg-white px-3 py-3 text-center ring-1 ring-stone-200/80">
          <Icon className="mx-auto size-5 text-emerald-600" />
          <dd className="mt-1.5 text-sm font-semibold text-stone-900">{value}</dd>
          <dt className="text-[11px] text-stone-500">{label}</dt>
        </div>
      ))}
    </dl>
  );
}
