import Image from "next/image";
import { Bookmark, ChefHat, Clock, Flame, Play, Star } from "lucide-react";
import { Avatar, Badge, Button, ButtonLink } from "@/components/ui";
import { compactNumber, formatDuration } from "@/lib/format";
import type { Recipe } from "@/types";

/** Hero banner: "Recipe of the day". Image first on mobile, split on md+. */
export function FeaturedRecipe({ recipe }: { recipe: Recipe }) {
  const total = recipe.prepMinutes + recipe.cookMinutes;
  return (
    <section className="overflow-hidden rounded-3xl bg-emerald-900 text-white md:grid md:grid-cols-[1.05fr_1fr]">
      <div className="relative order-2 flex flex-col justify-center gap-4 p-6 sm:p-8 lg:p-10">
        <div className="pointer-events-none absolute -bottom-24 -left-16 size-64 rounded-full bg-emerald-700/40" />
        <div className="relative flex flex-wrap items-center gap-2">
          <Badge tone="amber" variant="solid" size="md">
            <Flame /> Recipe of the day
          </Badge>
          {recipe.cuisine && <span className="text-xs font-medium text-emerald-200">{recipe.cuisine}</span>}
        </div>
        <h1 className="relative font-display text-2xl leading-tight font-semibold text-balance sm:text-3xl lg:text-4xl">
          {recipe.title}
        </h1>
        <p className="relative line-clamp-3 max-w-prose text-sm text-emerald-50/80 sm:text-base">{recipe.description}</p>

        <dl className="relative flex flex-wrap gap-x-5 gap-y-2 text-sm text-emerald-50">
          <div className="flex items-center gap-1.5">
            <Clock className="size-4 text-emerald-300" />
            <dt className="sr-only">Total time</dt>
            <dd>{total} min</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <ChefHat className="size-4 text-emerald-300" />
            <dt className="sr-only">Difficulty</dt>
            <dd className="capitalize">{recipe.difficulty}</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <Star className="size-4 fill-amber-400 text-amber-400" />
            <dt className="sr-only">Rating</dt>
            <dd>
              {recipe.rating} <span className="text-emerald-200/70">({compactNumber(recipe.ratingCount)})</span>
            </dd>
          </div>
          {recipe.nutrition && (
            <div className="flex items-center gap-1.5">
              <Flame className="size-4 text-emerald-300" />
              <dt className="sr-only">Calories</dt>
              <dd>{recipe.nutrition.calories} kcal</dd>
            </div>
          )}
        </dl>

        <div className="relative flex flex-wrap items-center gap-3 pt-1">
          <ButtonLink href={`/recipes/${recipe.slug}`} variant="accent" size="lg">
            <Play className="fill-current" /> Watch recipe
          </ButtonLink>
          <Button variant="ghost" size="lg" className="text-white hover:bg-white/10 hover:text-white">
            <Bookmark /> Save
          </Button>
        </div>

        <div className="relative flex items-center gap-2.5 border-t border-white/10 pt-4">
          <Avatar name={recipe.author.name} size="sm" verified={recipe.author.isVerified} className="[&>span:first-child]:ring-emerald-900" />
          <p className="text-sm">
            <span className="font-semibold">{recipe.author.name}</span>
            <span className="text-emerald-200/70"> · @{recipe.author.handle}</span>
          </p>
        </div>
      </div>

      <div className="relative order-1 aspect-[16/10] md:order-2 md:aspect-auto md:min-h-[360px]">
        <Image src={recipe.coverUrl} alt={recipe.title} fill priority sizes="(min-width:768px) 45vw, 100vw" className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-emerald-950/50 to-transparent md:bg-gradient-to-r md:from-emerald-900 md:via-emerald-900/10" />
        {recipe.videoDurationSec != null && (
          <Badge tone="dark" size="md" className="absolute right-4 bottom-4">
            <Play className="fill-current" /> {formatDuration(recipe.videoDurationSec)}
          </Badge>
        )}
      </div>
    </section>
  );
}
