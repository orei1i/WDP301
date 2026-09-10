import Image from "next/image";
import Link from "next/link";
import { MapPin, Navigation, Star, Store } from "lucide-react";
import { Badge, ButtonLink, Card, CardBody, CardHeader, CardTitle } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { Restaurant } from "@/types";

type ShopMatch = { venue: Restaurant; matched: string[] };

const KIND_LABEL: Record<Restaurant["kind"], string> = { shop: "Grocery", market: "Market", restaurant: "Restaurant", cafe: "Café" };

/** Sidebar: where to buy this recipe's ingredients + nearby places serving similar food. */
export function ShopSuggestions({ shops, restaurants, totalIngredients }: { shops: ShopMatch[]; restaurants: Restaurant[]; totalIngredients: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Store className="size-4 text-emerald-600" /> Where to buy
        </CardTitle>
        <Link href="/nearby" className="text-xs font-medium text-emerald-700 hover:underline">
          Map
        </Link>
      </CardHeader>
      <CardBody className="space-y-3">
        {shops.map(({ venue: v, matched }) => (
          <article key={v.id} className="group relative rounded-2xl p-2 ring-1 ring-stone-200/80 transition hover:bg-stone-50 hover:ring-emerald-200">
            <div className="flex gap-3">
              <div className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-emerald-100 to-amber-100">
                <Image src={v.coverUrl} alt="" fill sizes="64px" className="object-cover" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-sm font-semibold text-stone-900">
                  <Link href={`/nearby?venue=${v.slug}`} className="after:absolute after:inset-0">
                    {v.name}
                  </Link>
                </h3>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-stone-500">
                  <span>{KIND_LABEL[v.kind]}</span>·<MapPin className="size-3" />
                  {v.distanceKm} km ·
                  <span className="inline-flex items-center gap-0.5 font-medium text-stone-700">
                    <Star className="size-3 fill-amber-400 text-amber-400" />
                    {v.rating}
                  </span>
                </p>
                <p className={cn("mt-0.5 text-xs font-medium", v.isOpenNow ? "text-emerald-700" : "text-rose-600")}>
                  {v.isOpenNow ? "Open now" : "Closed"} <span className="font-normal text-stone-400">· {v.openingHours}</span>
                </p>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1">
              <span className="mr-0.5 text-[11px] font-semibold text-emerald-700">
                {matched.length}/{totalIngredients} items
              </span>
              {matched.slice(0, 3).map((m) => (
                <Badge key={m} tone="stone">
                  {m}
                </Badge>
              ))}
              {matched.length > 3 && <Badge tone="stone">+{matched.length - 3}</Badge>}
            </div>
          </article>
        ))}

        {restaurants.length > 0 && (
          <div className="border-t border-stone-100 pt-3">
            <p className="mb-2 text-[11px] font-semibold tracking-wider text-stone-400 uppercase">Too tired to cook?</p>
            <ul className="space-y-2">
              {restaurants.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-stone-800">{r.name}</p>
                    <p className="text-xs text-stone-500">
                      {r.veganLevel === "vegan" ? "100% vegan" : "Vegan options"} · {r.distanceKm} km
                    </p>
                  </div>
                  <ButtonLink href={`/nearby?venue=${r.slug}`} variant="outline" size="icon-sm" aria-label={`Directions to ${r.name}`}>
                    <Navigation />
                  </ButtonLink>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
