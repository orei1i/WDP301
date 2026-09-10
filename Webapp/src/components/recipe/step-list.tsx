"use client";

import { useState } from "react";
import { Check, Clock, Lightbulb, PlayCircle } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/format";
import { useRecipePlayer } from "./player-context";

/** Step-by-step instructions synced to the video: active step highlights, "Watch" jumps the player. */
export function StepList() {
  const { steps, activeStepIndex, seek, scrollToPlayer } = useRecipePlayer();
  const [done, setDone] = useState<Set<number>>(new Set());

  const toggle = (order: number) =>
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(order)) next.delete(order);
      else next.add(order);
      return next;
    });

  return (
    <section aria-labelledby="steps-heading">
      <div className="flex items-baseline justify-between">
        <h2 id="steps-heading" className="font-display text-lg font-semibold text-stone-900">
          Step by step
        </h2>
        <span className="text-xs text-stone-500">
          {done.size}/{steps.length} done
        </span>
      </div>

      <ol className="relative mt-4 space-y-3">
        {steps.map((s, i) => {
          const isDone = done.has(s.order);
          const isActive = i === activeStepIndex;
          return (
            <li
              key={s.order}
              className={cn(
                "relative rounded-2xl border p-4 transition sm:p-5",
                isActive ? "border-emerald-300 bg-emerald-50/60 shadow-sm ring-4 ring-emerald-500/10" : "border-stone-200/80 bg-white",
                isDone && !isActive && "opacity-60",
              )}
            >
              <div className="flex gap-3.5">
                <button
                  onClick={() => toggle(s.order)}
                  aria-pressed={isDone}
                  aria-label={isDone ? `Mark step ${s.order} not done` : `Mark step ${s.order} done`}
                  className={cn(
                    "grid size-9 shrink-0 place-items-center rounded-full text-sm font-bold transition",
                    isDone ? "bg-emerald-600 text-white" : isActive ? "bg-emerald-600 text-white" : "bg-stone-100 text-stone-600 hover:bg-emerald-100 hover:text-emerald-800",
                  )}
                >
                  {isDone ? <Check className="size-4" strokeWidth={3} /> : s.order}
                </button>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    {s.title && <h3 className={cn("font-semibold text-stone-900", isDone && "line-through decoration-stone-400")}>{s.title}</h3>}
                    {s.durationMin != null && (
                      <span className="inline-flex items-center gap-1 text-xs text-stone-500">
                        <Clock className="size-3.5" /> {s.durationMin} min
                      </span>
                    )}
                    {isActive && <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold tracking-wide text-white uppercase">Now playing</span>}
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed text-stone-600 sm:text-[15px]">{s.body}</p>

                  {s.tip && (
                    <p className="mt-3 flex gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      <Lightbulb className="mt-0.5 size-4 shrink-0 text-amber-500" /> {s.tip}
                    </p>
                  )}

                  {s.timestampSec != null && (
                    <button
                      onClick={() => {
                        seek(s.timestampSec!);
                        scrollToPlayer();
                      }}
                      className="mt-3 inline-flex items-center gap-1.5 rounded-full text-xs font-semibold text-emerald-700 hover:text-emerald-900"
                    >
                      <PlayCircle className="size-4" /> Watch this step · {formatDuration(s.timestampSec)}
                    </button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {done.size === steps.length && steps.length > 0 && (
        <div className="mt-4 rounded-2xl bg-emerald-800 p-5 text-center text-white">
          <p className="font-display text-lg font-semibold">Dinner's ready!</p>
          <p className="mt-1 text-sm text-emerald-100/80">Rate this recipe and share a photo with the community.</p>
        </div>
      )}
    </section>
  );
}
