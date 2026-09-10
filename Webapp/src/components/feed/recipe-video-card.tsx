"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Bookmark, Clock, Heart, Play, Star } from "lucide-react";
import { Avatar, Badge } from "@/components/ui";
import { cn } from "@/lib/cn";
import { compactNumber, formatDuration } from "@/lib/format";
import type { Recipe } from "@/types";

const DIFFICULTY_LABEL: Record<Recipe["difficulty"], string> = { easy: "Easy", medium: "Medium", hard: "Hard" };

type RecipeVideoCardProps = {
  recipe: Recipe;
  saved?: boolean;
  onToggleSave?: (id: string, saved: boolean) => void;
  priority?: boolean;
  className?: string;
};

/** Kitchen-Stories style portrait video card. Whole card is a link (stretched), save button sits above it. */
export function RecipeVideoCard({ recipe, saved: savedProp = false, onToggleSave, priority, className }: RecipeVideoCardProps) {
  const [saved, setSaved] = useState(savedProp);
  const totalMin = recipe.prepMinutes + recipe.cookMinutes;

  return (
    <article className={cn("group relative flex flex-col", className)}>
      <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-100 via-lime-50 to-amber-100">
        <Image
          src={recipe.coverUrl}
          alt=""
          fill
          priority={priority}
          sizes="(min-width:1536px) 20vw, (min-width:768px) 30vw, 50vw"
          className="object-cover transition duration-500 group-hover:scale-[1.04]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-stone-950/60 via-stone-950/0 to-stone-950/10" />

        {recipe.videoDurationSec != null && (
          <Badge tone="dark" size="md" className="absolute top-2.5 left-2.5">
            <Play className="fill-current" /> {formatDuration(recipe.videoDurationSec)}
          </Badge>
        )}

        <span
          aria-hidden
          className="absolute top-1/2 left-1/2 grid size-14 -translate-x-1/2 -translate-y-1/2 scale-90 place-items-center rounded-full bg-white/90 text-emerald-700 opacity-0 shadow-lg transition group-hover:scale-100 group-hover:opacity-100"
        >
          <Play className="ml-0.5 size-6 fill-current" />
        </span>

        <div className="absolute inset-x-2.5 bottom-2.5 flex items-center justify-between text-xs font-medium text-white">
          <span className="inline-flex items-center gap-1">
            <Heart className="size-3.5 fill-current" /> {compactNumber(recipe.likes)}
          </span>
          {recipe.foodTypes.includes("high-protein") && (
            <Badge tone="amber" variant="solid" className="hidden sm:inline-flex">
              High-protein
            </Badge>
          )}
        </div>
      </div>

      <button
        onClick={() => {
          setSaved((s) => !s);
          onToggleSave?.(recipe.id, !saved);
        }}
        aria-pressed={saved}
        aria-label={saved ? "Remove from saved" : "Save recipe"}
        className={cn(
          "absolute top-2 right-2 z-10 grid size-9 place-items-center rounded-full shadow-sm backdrop-blur transition active:scale-90",
          saved ? "bg-emerald-600 text-white" : "bg-white/90 text-stone-700 hover:bg-white",
        )}
      >
        <Bookmark className={cn("size-4", saved && "fill-current")} />
      </button>

      <div className="flex flex-1 flex-col px-0.5 pt-3">
        <h3 className="line-clamp-2 font-display text-[15px] leading-snug font-semibold text-stone-900 sm:text-base">
          <Link href={`/recipes/${recipe.slug}`} className="after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none">
            {recipe.title}
          </Link>
        </h3>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-stone-500">
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3.5" /> {totalMin} min
          </span>
          <span className="inline-flex items-center gap-1">
            <Star className="size-3.5 fill-amber-400 text-amber-400" />
            <span className="font-semibold text-stone-700">{recipe.rating.toFixed(1)}</span>
            <span className="hidden sm:inline">({compactNumber(recipe.ratingCount)})</span>
          </span>
          <span className="hidden sm:inline">{DIFFICULTY_LABEL[recipe.difficulty]}</span>
        </div>

        <div className="mt-auto flex items-center gap-2 pt-2.5">
          <Avatar name={recipe.author.name} src={recipe.author.avatarUrl} size="xs" verified={recipe.author.isVerified} />
          <span className="truncate text-xs font-medium text-stone-600">{recipe.author.name}</span>
        </div>
      </div>
    </article>
  );
}

export function RecipeVideoCardSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="aspect-[4/5] rounded-2xl bg-stone-200" />
      <div className="mt-3 h-4 w-4/5 rounded bg-stone-200" />
      <div className="mt-2 h-3 w-1/2 rounded bg-stone-200" />
    </div>
  );
}
