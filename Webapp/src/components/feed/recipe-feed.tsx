"use client";

import { useMemo, useState } from "react";
import { ArrowRight, SlidersHorizontal } from "lucide-react";
import { Button, ButtonLink, Chip, SectionHeader } from "@/components/ui";
import type { Recipe } from "@/types";
import { RecipeVideoCard } from "./recipe-video-card";

type Filter = { id: string; label: string; test: (r: Recipe) => boolean };

const FILTERS: Filter[] = [
  { id: "all", label: "All", test: () => true },
  { id: "quick", label: "Under 30 min", test: (r) => r.prepMinutes + r.cookMinutes <= 30 },
  { id: "breakfast", label: "Breakfast", test: (r) => r.recipeType === "breakfast" },
  { id: "main", label: "Mains", test: (r) => r.recipeType === "main" },
  { id: "salad", label: "Bowls & salads", test: (r) => r.recipeType === "salad" },
  { id: "soup", label: "Soups", test: (r) => r.recipeType === "soup" },
  { id: "protein", label: "High-protein", test: (r) => r.foodTypes.includes("high-protein") },
  { id: "gf", label: "Gluten-free", test: (r) => r.foodTypes.includes("gluten-free") },
];

const PAGE_SIZE = 6;

type SortKey = "trending" | "newest" | "top";

const SORTS: Record<SortKey, (a: Recipe, b: Recipe) => number> = {
  trending: (a, b) => b.views - a.views,
  newest: (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
  top: (a, b) => b.rating - a.rating,
};

export function RecipeFeed({ recipes }: { recipes: Recipe[] }) {
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState<SortKey>("trending");
  const [limit, setLimit] = useState(PAGE_SIZE);

  const visible = useMemo(() => {
    const f = FILTERS.find((x) => x.id === filter) ?? FILTERS[0]!;
    return recipes.filter(f.test).sort(SORTS[sort]);
  }, [recipes, filter, sort]);

  return (
    <section aria-labelledby="recipes-heading" className="space-y-4">
      <SectionHeader
        eyebrow="Watch & cook"
        title="Trending video recipes"
        action={
          <ButtonLink href="/recipes" variant="ghost" size="sm" className="text-emerald-700">
            See all <ArrowRight />
          </ButtonLink>
        }
      />

      <div className="flex items-center gap-3">
        <div className="no-scrollbar -mx-4 flex flex-1 gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0 sm:pr-6 sm:[mask-image:linear-gradient(to_right,black_92%,transparent)]" role="toolbar" aria-label="Filter recipes">
          {FILTERS.map((f) => (
            <Chip key={f.id} active={filter === f.id} onClick={() => {
                setFilter(f.id);
                setLimit(PAGE_SIZE);
              }}>
              {f.label}
            </Chip>
          ))}
        </div>
        <label className="relative hidden shrink-0 items-center sm:flex">
          <span className="sr-only">Sort by</span>
          <SlidersHorizontal className="pointer-events-none absolute left-3 size-4 text-stone-400" />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="h-9 appearance-none rounded-full border border-stone-200 bg-white pr-4 pl-9 text-sm font-medium text-stone-700 outline-none focus:border-emerald-500"
          >
            <option value="trending">Trending</option>
            <option value="newest">Newest</option>
            <option value="top">Top rated</option>
          </select>
        </label>
      </div>

      {visible.length ? (
        <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:gap-x-5 md:grid-cols-3 2xl:grid-cols-4">
          {visible.slice(0, limit).map((r, i) => (
            <RecipeVideoCard key={r.id} recipe={r} priority={i < 2} />
          ))}
        </div>
      ) : null}

      {visible.length > limit && (
        <div className="flex justify-center pt-2">
          <Button variant="outline" onClick={() => setLimit((l) => l + PAGE_SIZE)}>
            Load more recipes <span className="text-stone-400">({visible.length - limit})</span>
          </Button>
        </div>
      )}

      {!visible.length && (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-12 text-center text-sm text-stone-500">
          No recipes match this filter yet.{" "}
          <button className="font-medium text-emerald-700 hover:underline" onClick={() => setFilter("all")}>
            Clear filter
          </button>
        </div>
      )}
    </section>
  );
}
