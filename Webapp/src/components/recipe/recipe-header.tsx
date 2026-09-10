"use client";

import Link from "next/link";
import { useState } from "react";
import { Bookmark, CalendarPlus, Check, Eye, Heart, Share2, Star } from "lucide-react";
import { useAuthModal } from "@/components/providers/auth-modal-provider";
import { useSession } from "@/components/providers/session-provider";
import { Avatar, Badge, Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import { compactNumber, timeAgo } from "@/lib/format";
import { FOOD_TYPES } from "@/lib/mock/taxonomy";
import type { Recipe } from "@/types";

export function RecipeHeader({ recipe }: { recipe: Recipe }) {
  const { role } = useSession();
  const { openAuth } = useAuthModal();
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [following, setFollowing] = useState(false);
  const [shared, setShared] = useState(false);
  const isGuest = role === "guest";

  /** Run `fn` if signed in, otherwise open the auth modal with context. */
  const gated = (reason: Parameters<typeof openAuth>[1], fn: () => void) => () => (isGuest ? openAuth("login", reason) : fn());

  const share = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      if (navigator.share) await navigator.share({ title: recipe.title, url });
      else await navigator.clipboard.writeText(url);
      setShared(true);
      window.setTimeout(() => setShared(false), 1800);
    } catch {
      /* user cancelled */
    }
  };

  return (
    <header className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        {recipe.cuisine && <Badge tone="amber" size="md">{recipe.cuisine}</Badge>}
        {recipe.foodTypes.map((slug) => (
          <Link key={slug} href={`/recipes?diet=${slug}`}>
            <Badge tone="emerald" size="md" className="hover:bg-emerald-100">
              {FOOD_TYPES.find((f) => f.slug === slug)?.name ?? slug}
            </Badge>
          </Link>
        ))}
      </div>

      <div>
        <h1 className="font-display text-2xl leading-tight font-semibold text-balance text-stone-900 sm:text-3xl lg:text-4xl">{recipe.title}</h1>
        <p className="mt-2 max-w-3xl text-stone-600 sm:text-lg">{recipe.description}</p>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-stone-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="flex">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className={cn("size-4", i < Math.round(recipe.rating) ? "fill-amber-400 text-amber-400" : "fill-stone-200 text-stone-200")} />
            ))}
          </span>
          <span className="font-semibold text-stone-800">{recipe.rating.toFixed(1)}</span>
          <a href="#reviews" className="hover:underline">({compactNumber(recipe.ratingCount)} ratings)</a>
        </span>
        <span className="inline-flex items-center gap-1">
          <Eye className="size-4" /> {compactNumber(recipe.views)} views
        </span>
        <span>Posted {timeAgo(recipe.createdAt)}</span>
      </div>

      {/* Author + actions */}
      <div className="flex flex-col gap-3 border-y border-stone-200/80 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Avatar name={recipe.author.name} src={recipe.author.avatarUrl} verified={recipe.author.isVerified} />
          <div className="min-w-0">
            <p className="truncate font-semibold text-stone-900">{recipe.author.name}</p>
            <p className="truncate text-xs text-stone-500">@{recipe.author.handle}{recipe.author.isVerified && " · Verified chef"}</p>
          </div>
          <Button
            size="sm"
            variant={following ? "outline" : "secondary"}
            className="ml-1 h-8"
            onClick={gated("follow", () => setFollowing((f) => !f))}
          >
            {following ? (
              <>
                <Check /> Following
              </>
            ) : (
              "Follow"
            )}
          </Button>
        </div>

        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <Button size="sm" variant="outline" aria-pressed={liked} onClick={gated("save", () => setLiked((l) => !l))} className={cn(liked && "border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-50")}>
            <Heart className={cn(liked && "fill-current")} /> {compactNumber(recipe.likes + (liked ? 1 : 0))}
          </Button>
          <Button size="sm" variant="outline" aria-pressed={saved} onClick={gated("save", () => setSaved((s) => !s))} className={cn(saved && "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50")}>
            <Bookmark className={cn(saved && "fill-current")} /> {saved ? "Saved" : "Save"}
          </Button>
          <Button size="sm" variant="outline" onClick={share}>
            {shared ? <Check /> : <Share2 />} {shared ? "Link copied" : "Share"}
          </Button>
          <Button size="sm" onClick={gated("plan", () => {})}>
            <CalendarPlus /> Add to plan
          </Button>
        </div>
      </div>
    </header>
  );
}
