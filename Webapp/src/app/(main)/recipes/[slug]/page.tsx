import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { RecipeVideoCard } from "@/components/feed/recipe-video-card";
import {
  AuthorCard,
  ChapterStrip,
  NutritionCard,
  RecipeBody,
  RecipeHeader,
  RecipePlayerProvider,
  RecipeReviews,
  RecipeStats,
  ShopSuggestions,
  VideoPlayer,
} from "@/components/recipe";
import { SectionHeader } from "@/components/ui";
import { getRecipeBySlug, getRelatedRecipes, getRestaurantsNearby, getShopsForRecipe, RECIPES, RECIPE_TYPES, REVIEWS, USERS } from "@/lib/mock";

type Params = { slug: string };

export function generateStaticParams(): Params[] {
  return RECIPES.map((r) => ({ slug: r.slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const recipe = getRecipeBySlug((await params).slug);
  if (!recipe) return { title: "Recipe not found" };
  return { title: recipe.title, description: recipe.description, openGraph: { images: [recipe.coverUrl] } };
}

export default async function RecipeDetailPage({ params }: { params: Promise<Params> }) {
  const recipe = getRecipeBySlug((await params).slug);
  if (!recipe) notFound();

  const author = Object.values(USERS).find((u) => u.id === recipe.author.id);
  const related = getRelatedRecipes(recipe, 4);
  const shops = getShopsForRecipe(recipe);
  const typeLabel = RECIPE_TYPES.find((t) => t.slug === recipe.recipeType)?.name ?? "Recipes";

  return (
    <RecipePlayerProvider duration={recipe.videoDurationSec ?? 180} steps={recipe.steps}>
      <div className="mx-auto max-w-[1440px] px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
        <nav aria-label="Breadcrumb" className="mb-4 hidden items-center gap-1 text-sm text-stone-500 sm:flex">
          <Link href="/" className="hover:text-stone-800">Discover</Link>
          <ChevronRight className="size-4 text-stone-300" />
          <Link href={`/recipes?type=${recipe.recipeType}`} className="hover:text-stone-800">{typeLabel}</Link>
          <ChevronRight className="size-4 text-stone-300" />
          <span className="truncate font-medium text-stone-800">{recipe.title}</span>
        </nav>

        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
          <article className="min-w-0 space-y-6">
            <div>
              <VideoPlayer poster={recipe.coverUrl} title={recipe.title} />
              <ChapterStrip />
            </div>
            <RecipeHeader recipe={recipe} />
            <RecipeStats recipe={recipe} />
            <RecipeBody recipe={recipe} />
            <RecipeReviews rating={recipe.rating} ratingCount={recipe.ratingCount} reviews={REVIEWS.filter((r) => r.recipeId === recipe.id)} />
          </article>

          <aside className="grid content-start gap-5 sm:grid-cols-2 xl:grid-cols-1">
            <NutritionCard recipe={recipe} />
            {shops.length > 0 && <ShopSuggestions shops={shops} restaurants={getRestaurantsNearby(2)} totalIngredients={recipe.ingredients.length} />}
            {author && <AuthorCard user={author} />}
          </aside>
        </div>

        <section className="mt-12 space-y-4">
          <SectionHeader eyebrow="Keep cooking" title="You might also like" />
          <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:gap-x-5 md:grid-cols-4">
            {related.map((r) => (
              <RecipeVideoCard key={r.id} recipe={r} />
            ))}
          </div>
        </section>
      </div>
    </RecipePlayerProvider>
  );
}
