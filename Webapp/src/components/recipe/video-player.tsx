"use client";

import Image from "next/image";
import { useRef } from "react";
import { Gauge, Maximize, Pause, Play, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/format";
import { useRecipePlayer } from "./player-context";

/**
 * Video player STUB: poster + simulated playback clock, chapter ticks from step timestamps.
 * Replace the poster layer with <video src={recipe.videoUrl}> when media hosting is ready.
 */
export function VideoPlayer({ poster, title }: { poster: string; title: string }) {
  const p = useRecipePlayer();
  const boxRef = useRef<HTMLDivElement>(null);
  const pct = (p.time / p.duration) * 100;
  const ended = p.started && !p.playing && p.time >= p.duration;
  const current = p.activeStepIndex >= 0 ? p.steps[p.activeStepIndex] : undefined;

  return (
    <div
      ref={(el) => {
        boxRef.current = el;
        p.registerPlayer(el);
      }}
      className="group/player relative -mx-4 scroll-mt-20 overflow-hidden bg-stone-950 sm:mx-0 sm:rounded-3xl"
    >
      <div className="relative aspect-video">
        <Image src={poster} alt={title} fill priority sizes="(min-width:1280px) 60vw, 100vw" className={cn("object-cover transition duration-700", p.playing && "scale-[1.03]")} />
        <div className={cn("absolute inset-0 transition", p.started ? "bg-stone-950/35" : "bg-gradient-to-t from-stone-950/70 via-stone-950/10 to-transparent")} />

        {/* Click-to-toggle surface */}
        <button className="absolute inset-0 z-0 cursor-pointer" onClick={p.toggle} aria-label={p.playing ? "Pause video" : "Play video"} />

        {/* Big play / replay */}
        {!p.playing && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <span className="grid size-16 place-items-center rounded-full bg-white/95 text-emerald-700 shadow-2xl transition group-hover/player:scale-105 sm:size-20">
              {ended ? <RotateCcw className="size-7 sm:size-8" /> : <Play className="ml-1 size-7 fill-current sm:size-9" />}
            </span>
          </div>
        )}

        {!p.started && (
          <div className="pointer-events-none absolute bottom-16 left-4 text-white sm:bottom-20 sm:left-6">
            <p className="text-xs font-semibold tracking-wider text-emerald-300 uppercase">Watch the full recipe</p>
            <p className="font-display text-lg font-semibold sm:text-xl">{formatDuration(p.duration)} · {p.steps.length} steps</p>
          </div>
        )}

        {/* Live caption = current step */}
        {p.started && current && (
          <div className="pointer-events-none absolute top-3 left-3 max-w-[80%] rounded-xl bg-stone-950/70 px-3 py-2 text-white backdrop-blur-sm sm:top-4 sm:left-4">
            <p className="text-[10px] font-semibold tracking-wider text-emerald-300 uppercase">Step {current.order}</p>
            <p className="text-sm font-medium">{current.title}</p>
          </div>
        )}
        {p.started && (
          <span className="pointer-events-none absolute top-3 right-3 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold tracking-wide text-stone-900 uppercase sm:top-4 sm:right-4">
            Preview stub
          </span>
        )}

        {/* Controls */}
        <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-stone-950/90 to-transparent px-3 pt-8 pb-2.5 sm:px-5 sm:pb-4">
          {/* Scrubber with chapter ticks */}
          <div className="group/scrub relative h-4">
            <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/25 transition-all group-hover/scrub:h-1.5">
              <div className="h-full rounded-full bg-emerald-400" style={{ width: `${pct}%` }} />
            </div>
            {p.steps.map((s) =>
              s.timestampSec != null ? (
                <span
                  key={s.order}
                  className="pointer-events-none absolute top-1/2 h-2.5 w-0.5 -translate-y-1/2 rounded-full bg-white/70"
                  style={{ left: `${(s.timestampSec / p.duration) * 100}%` }}
                />
              ) : null,
            )}
            <input
              type="range"
              min={0}
              max={p.duration}
              step={0.25}
              value={p.time}
              onChange={(e) => p.seek(Number(e.target.value), p.playing)}
              aria-label="Seek"
              className="absolute inset-0 w-full cursor-pointer opacity-0"
            />
          </div>

          <div className="mt-1.5 flex items-center gap-1 text-white sm:gap-2">
            <CtrlBtn onClick={p.toggle} label={p.playing ? "Pause" : "Play"}>
              {p.playing ? <Pause className="fill-current" /> : <Play className="fill-current" />}
            </CtrlBtn>
            <CtrlBtn onClick={p.toggleMute} label={p.muted ? "Unmute" : "Mute"}>
              {p.muted ? <VolumeX /> : <Volume2 />}
            </CtrlBtn>
            <span className="text-xs tabular-nums text-white/85">
              {formatDuration(p.time)} <span className="text-white/50">/ {formatDuration(p.duration)}</span>
            </span>
            <div className="ml-auto flex items-center gap-1">
              <button onClick={p.cycleRate} className="flex h-8 items-center gap-1 rounded-full px-2 text-xs font-semibold hover:bg-white/15" aria-label="Playback speed">
                <Gauge className="size-4" /> {p.rate}×
              </button>
              <CtrlBtn onClick={() => boxRef.current?.requestFullscreen?.()} label="Fullscreen">
                <Maximize />
              </CtrlBtn>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CtrlBtn({ onClick, label, children }: { onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-label={label} className="grid size-8 place-items-center rounded-full hover:bg-white/15 [&_svg]:size-[18px]">
      {children}
    </button>
  );
}

/** Horizontal chapter list under the player — tap to jump. */
export function ChapterStrip() {
  const p = useRecipePlayer();
  return (
    <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 py-3 sm:mx-0 sm:px-0" role="list" aria-label="Video chapters">
      {p.steps.map((s, i) => {
        const active = i === p.activeStepIndex;
        return (
          <button
            key={s.order}
            role="listitem"
            onClick={() => s.timestampSec != null && p.seek(s.timestampSec)}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-full border py-1.5 pr-3.5 pl-1.5 text-xs font-medium transition",
              active ? "border-emerald-600 bg-emerald-600 text-white" : "border-stone-200 bg-white text-stone-600 hover:border-emerald-300",
            )}
          >
            <span className={cn("grid size-6 place-items-center rounded-full text-[11px] font-bold", active ? "bg-white/20" : "bg-stone-100 text-stone-500")}>{s.order}</span>
            <span className="max-w-[140px] truncate">{s.title}</span>
            {s.timestampSec != null && <span className={cn("tabular-nums", active ? "text-emerald-100" : "text-stone-400")}>{formatDuration(s.timestampSec)}</span>}
          </button>
        );
      })}
    </div>
  );
}
