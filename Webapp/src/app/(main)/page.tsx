import { FeaturedRecipe, AiNutritionPromo, ForumFeed, NearbyTeaser, RecipeFeed, TopContributors, TrendingTags } from "@/components/feed";
import { FORUM_POSTS, getFeaturedRecipe, RECIPES, TRENDING_TAGS, USERS } from "@/lib/mock";

export default function DiscoverPage() {
  const featured = getFeaturedRecipe();
  const creators = [USERS.marco!, USERS.linh!, USERS.aiko!];

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-10">
          <FeaturedRecipe recipe={featured} />
          <RecipeFeed recipes={RECIPES.filter((r) => r.id !== featured.id)} />
          <ForumFeed posts={FORUM_POSTS} />
        </div>

        <aside className="grid content-start gap-5 sm:grid-cols-2 xl:sticky xl:top-24 xl:grid-cols-1 xl:self-start">
          <AiNutritionPromo />
          <NearbyTeaser />
          <TrendingTags tags={TRENDING_TAGS} />
          <TopContributors users={creators} />
        </aside>
      </div>
    </div>
  );
}
