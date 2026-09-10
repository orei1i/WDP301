"use client";

import { useState } from "react";
import { CheckCircle2, Star, ThumbsUp } from "lucide-react";
import { useAuthModal } from "@/components/providers/auth-modal-provider";
import { useSession } from "@/components/providers/session-provider";
import { Avatar, Badge, Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import { compactNumber, timeAgo } from "@/lib/format";
import { ratingDistribution, type RecipeReview } from "@/lib/mock/reviews";

type Props = { rating: number; ratingCount: number; reviews: RecipeReview[] };

export function RecipeReviews({ rating, ratingCount, reviews }: Props) {
  const { role, user } = useSession();
  const { openAuth } = useAuthModal();
  const [list, setList] = useState(reviews);
  const [stars, setStars] = useState(0);
  const [hover, setHover] = useState(0);
  const [body, setBody] = useState("");
  const dist = ratingDistribution(rating, ratingCount);

  const submit = () => {
    if (!user || !stars || !body.trim()) return;
    setList((l) => [
      { id: `new${l.length}`, recipeId: "", author: { id: user.id, name: user.name, handle: user.handle }, rating: stars as RecipeReview["rating"], body: body.trim(), likes: 0, madeIt: true, createdAt: new Date().toISOString() },
      ...l,
    ]);
    setStars(0);
    setBody("");
  };

  return (
    <section id="reviews" aria-labelledby="reviews-heading" className="scroll-mt-20 rounded-3xl bg-white p-5 ring-1 ring-stone-200/80 sm:p-6">
      <h2 id="reviews-heading" className="font-display text-lg font-semibold text-stone-900">
        Reviews & tips
      </h2>

      <div className="mt-4 grid gap-6 sm:grid-cols-[180px_1fr]">
        <div className="text-center sm:text-left">
          <p className="font-display text-5xl font-semibold text-stone-900">{rating.toFixed(1)}</p>
          <div className="mt-1 flex justify-center gap-0.5 sm:justify-start">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className={cn("size-4", i < Math.round(rating) ? "fill-amber-400 text-amber-400" : "fill-stone-200 text-stone-200")} />
            ))}
          </div>
          <p className="mt-1 text-xs text-stone-500">{compactNumber(ratingCount)} ratings</p>
        </div>
        <ul className="space-y-1.5">
          {dist.map((n, i) => (
            <li key={i} className="flex items-center gap-2 text-xs text-stone-500">
              <span className="w-3 text-right tabular-nums">{5 - i}</span>
              <Star className="size-3 fill-amber-400 text-amber-400" />
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-stone-100">
                <span className="block h-full rounded-full bg-amber-400" style={{ width: `${(n / ratingCount) * 100}%` }} />
              </span>
              <span className="w-10 text-right tabular-nums">{compactNumber(n)}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Composer */}
      <div className="mt-6 rounded-2xl bg-stone-50 p-4">
        {role === "guest" ? (
          <div className="flex flex-col items-center justify-between gap-3 text-center sm:flex-row sm:text-left">
            <p className="text-sm text-stone-600">Made this? Share your rating and tips with the community.</p>
            <Button size="sm" onClick={() => openAuth("login", "post")}>
              Log in to review
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)} role="radiogroup" aria-label="Your rating">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} role="radio" aria-checked={stars === n} aria-label={`${n} stars`} onMouseEnter={() => setHover(n)} onClick={() => setStars(n)}>
                  <Star className={cn("size-6 transition", n <= (hover || stars) ? "fill-amber-400 text-amber-400" : "text-stone-300")} />
                </button>
              ))}
              <span className="ml-2 text-xs text-stone-500">{stars ? `${stars}/5` : "Tap to rate"}</span>
            </div>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              placeholder="What did you change? Any tips for others?"
              className="w-full resize-none rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
            />
            <div className="flex justify-end">
              <Button size="sm" disabled={!stars || !body.trim()} onClick={submit}>
                Post review
              </Button>
            </div>
          </div>
        )}
      </div>

      <ul className="mt-5 divide-y divide-stone-100">
        {list.map((r) => (
          <li key={r.id} className="flex gap-3 py-4">
            <Avatar name={r.author.name} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-sm font-semibold text-stone-900">{r.author.name}</span>
                <span className="flex">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className={cn("size-3", i < r.rating ? "fill-amber-400 text-amber-400" : "fill-stone-200 text-stone-200")} />
                  ))}
                </span>
                {r.madeIt && (
                  <Badge tone="emerald">
                    <CheckCircle2 /> Made it
                  </Badge>
                )}
                <span className="text-xs text-stone-400">{timeAgo(r.createdAt)}</span>
              </div>
              <p className="mt-1 text-sm leading-relaxed text-stone-600">{r.body}</p>
              <button className="mt-2 inline-flex items-center gap-1 text-xs text-stone-400 hover:text-emerald-700">
                <ThumbsUp className="size-3.5" /> Helpful · {r.likes}
              </button>
            </div>
          </li>
        ))}
        {list.length === 0 && <li className="py-6 text-center text-sm text-stone-500">No written reviews yet — be the first.</li>}
      </ul>
    </section>
  );
}
