"use client";

import Link from "next/link";
import { ArrowRight, Hash, MapPin, Sparkles, Star, TrendingUp } from "lucide-react";
import { useSession } from "@/components/providers/session-provider";
import { Avatar, Button, ButtonLink, Card, CardBody, CardHeader, CardTitle } from "@/components/ui";
import { compactNumber } from "@/lib/format";
import type { User } from "@/types";

export function AiNutritionPromo() {
  const { role, aiQuota } = useSession();
  const left = Math.max(0, aiQuota.limit - aiQuota.used);
  const isGuest = role === "guest";

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-50 via-orange-50 to-amber-100 p-5 ring-1 ring-amber-200/70">
      <div className="pointer-events-none absolute -top-10 -right-10 size-32 rounded-full bg-amber-300/30" />
      <div className="relative flex items-center gap-2">
        <span className="grid size-9 place-items-center rounded-xl bg-amber-400 text-stone-900">
          <Sparkles className="size-5" />
        </span>
        <div>
          <p className="font-display font-semibold text-stone-900">AI Nutritionist</p>
          <p className="text-xs text-amber-800">Macros, swaps & B12 questions</p>
        </div>
      </div>
      <p className="relative mt-3 text-sm text-stone-700">“Is this bowl enough protein after a workout?” — ask anything about your plate.</p>
      {isGuest && (
        <div className="relative mt-3">
          <div className="flex justify-between text-xs font-medium text-amber-900">
            <span>Free trial</span>
            <span>
              {left}/{aiQuota.limit} queries left
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-amber-200">
            <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${(left / aiQuota.limit) * 100}%` }} />
          </div>
        </div>
      )}
      <Button variant="primary" size="sm" className="relative mt-4 w-full">
        Ask the AI
      </Button>
    </div>
  );
}

export function TrendingTags({ tags }: { tags: string[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="size-4 text-emerald-600" /> Trending topics
        </CardTitle>
      </CardHeader>
      <CardBody className="flex flex-wrap gap-1.5">
        {tags.map((t) => (
          <Link
            key={t}
            href={`/search?tag=${t}`}
            className="inline-flex items-center gap-0.5 rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-600 transition hover:bg-emerald-50 hover:text-emerald-800"
          >
            <Hash className="size-3" />
            {t}
          </Link>
        ))}
      </CardBody>
    </Card>
  );
}

export function TopContributors({ users }: { users: User[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Top creators this week</CardTitle>
      </CardHeader>
      <CardBody>
        <ol className="space-y-3">
          {users.map((u, i) => (
            <li key={u.id} className="flex items-center gap-3">
              <span className="w-4 text-center text-xs font-semibold text-stone-400 tabular-nums">{i + 1}</span>
              <Avatar name={u.name} size="sm" verified={u.role === "verified-chef"} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-stone-800">{u.name}</p>
                <p className="truncate text-xs text-stone-500">
                  {u.stats?.recipes} recipes · {compactNumber(u.stats?.followers ?? 0)} followers
                </p>
              </div>
              <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs">
                Follow
              </Button>
            </li>
          ))}
        </ol>
      </CardBody>
    </Card>
  );
}

const NEARBY = [
  { name: "Hum Vegetarian Café", area: "District 3", km: 1.2, rating: 4.7 },
  { name: "Organik Grocer", area: "Thảo Điền", km: 3.8, rating: 4.5 },
  { name: "Loving Hut Hoa Đăng", area: "Bình Thạnh", km: 4.1, rating: 4.6 },
];

export function NearbyTeaser() {
  return (
    <Card className="overflow-hidden">
      <div className="relative h-28 bg-[linear-gradient(135deg,#d1fae5_0%,#ecfccb_50%,#fef3c7_100%)]">
        {/* Map placeholder: fake streets + pins */}
        <svg className="absolute inset-0 h-full w-full text-white/80" aria-hidden>
          <path d="M-10 70 Q 80 40 160 80 T 360 60" stroke="currentColor" strokeWidth="6" fill="none" />
          <path d="M120 -10 L 150 140" stroke="currentColor" strokeWidth="4" fill="none" />
          <path d="M240 -10 Q 220 60 260 140" stroke="currentColor" strokeWidth="4" fill="none" />
        </svg>
        {[
          ["28%", "38%"],
          ["58%", "58%"],
          ["76%", "30%"],
        ].map(([l, t]) => (
          <MapPin key={l} className="absolute size-6 -translate-x-1/2 -translate-y-full fill-emerald-600 text-white drop-shadow" style={{ left: l, top: t }} />
        ))}
      </div>
      <CardHeader className="pt-4">
        <CardTitle>Vegan spots near you</CardTitle>
        <span className="text-xs text-stone-400">Ho Chi Minh City</span>
      </CardHeader>
      <CardBody className="space-y-2.5">
        {NEARBY.map((v) => (
          <div key={v.name} className="flex items-center justify-between gap-2 text-sm">
            <div className="min-w-0">
              <p className="truncate font-medium text-stone-800">{v.name}</p>
              <p className="text-xs text-stone-500">
                {v.area} · {v.km} km
              </p>
            </div>
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-stone-700">
              <Star className="size-3.5 fill-amber-400 text-amber-400" /> {v.rating}
            </span>
          </div>
        ))}
        <ButtonLink href="/nearby" variant="secondary" size="sm" className="mt-2 w-full">
          Open map <ArrowRight />
        </ButtonLink>
      </CardBody>
    </Card>
  );
}
