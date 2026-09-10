"use client";

import { Sparkles } from "lucide-react";
import { useAiChat } from "@/components/providers/ai-chat-provider";
import { Button, Card, CardBody, CardHeader, CardTitle } from "@/components/ui";
import type { Recipe } from "@/types";

const MACROS = [
  { key: "proteinG", label: "Protein", kcalPerG: 4, color: "bg-emerald-500" },
  { key: "carbsG", label: "Carbs", kcalPerG: 4, color: "bg-amber-400" },
  { key: "fatG", label: "Fat", kcalPerG: 9, color: "bg-orange-500" },
] as const;

export function NutritionCard({ recipe }: { recipe: Recipe }) {
  const { openChat } = useAiChat();
  const n = recipe.nutrition;
  if (!n) return null;
  const macroKcal = MACROS.reduce((sum, m) => sum + n[m.key] * m.kcalPerG, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nutrition</CardTitle>
        <span className="text-xs text-stone-400">per serving</span>
      </CardHeader>
      <CardBody>
        <div className="flex items-end gap-2">
          <span className="font-display text-4xl font-semibold text-stone-900 tabular-nums">{n.calories}</span>
          <span className="pb-1.5 text-sm text-stone-500">kcal</span>
        </div>

        {/* Stacked energy split */}
        <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-stone-100">
          {MACROS.map((m) => (
            <span key={m.key} className={m.color} style={{ width: `${((n[m.key] * m.kcalPerG) / macroKcal) * 100}%` }} />
          ))}
        </div>

        <dl className="mt-4 grid grid-cols-3 gap-2">
          {MACROS.map((m) => (
            <div key={m.key} className="rounded-xl bg-stone-50 p-2.5">
              <dt className="flex items-center gap-1.5 text-[11px] text-stone-500">
                <span className={`size-2 rounded-full ${m.color}`} /> {m.label}
              </dt>
              <dd className="mt-0.5 font-semibold text-stone-900 tabular-nums">
                {n[m.key]} g <span className="text-[11px] font-normal text-stone-400">{Math.round(((n[m.key] * m.kcalPerG) / macroKcal) * 100)}%</span>
              </dd>
            </div>
          ))}
        </dl>
        {n.fiberG != null && <p className="mt-3 text-xs text-stone-500">Fibre {n.fiberG} g · estimates based on listed ingredients</p>}

        <Button
          variant="accent"
          size="sm"
          className="mt-4 w-full"
          onClick={() =>
            openChat({
              prompt: "Is this a good post-workout meal? How can I add more protein?",
              context: { kind: "recipe", id: recipe.id, title: recipe.title, kcal: n.calories, proteinG: n.proteinG },
            })
          }
        >
          <Sparkles /> Ask AI about this recipe
        </Button>
      </CardBody>
    </Card>
  );
}
