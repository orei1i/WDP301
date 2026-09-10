"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { RecipeStep } from "@/types";

/**
 * Shared playback state so the (stub) player, chapter strip and step list stay in sync.
 * Swap the interval "clock" for a real <video> element's timeupdate later — API stays the same.
 */
type PlayerContextValue = {
  duration: number;
  time: number;
  playing: boolean;
  rate: number;
  muted: boolean;
  started: boolean;
  activeStepIndex: number;
  steps: RecipeStep[];
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seek: (sec: number, autoplay?: boolean) => void;
  cycleRate: () => void;
  toggleMute: () => void;
  registerPlayer: (el: HTMLElement | null) => void;
  scrollToPlayer: () => void;
};

const RATES = [1, 1.25, 1.5, 2];
const PlayerContext = createContext<PlayerContextValue | null>(null);

export function RecipePlayerProvider({ duration, steps, children }: { duration: number; steps: RecipeStep[]; children: ReactNode }) {
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [rate, setRate] = useState(1);
  const [muted, setMuted] = useState(false);
  const playerEl = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setTime((t) => {
        const next = t + 0.25 * rate;
        if (next >= duration) {
          setPlaying(false);
          return duration;
        }
        return next;
      });
    }, 250);
    return () => window.clearInterval(id);
  }, [playing, rate, duration]);

  const play = useCallback(() => {
    setStarted(true);
    setTime((t) => (t >= duration ? 0 : t));
    setPlaying(true);
  }, [duration]);
  const pause = useCallback(() => setPlaying(false), []);
  const seek = useCallback(
    (sec: number, autoplay = true) => {
      setTime(Math.min(Math.max(0, sec), duration));
      if (autoplay) {
        setStarted(true);
        setPlaying(true);
      }
    },
    [duration],
  );

  const activeStepIndex = useMemo(() => {
    if (!started) return -1;
    let idx = -1;
    steps.forEach((s, i) => {
      if (s.timestampSec != null && s.timestampSec <= time) idx = i;
    });
    return idx;
  }, [steps, time, started]);

  const value = useMemo<PlayerContextValue>(
    () => ({
      duration,
      time,
      playing,
      rate,
      muted,
      started,
      activeStepIndex,
      steps,
      play,
      pause,
      toggle: () => (playing ? pause() : play()),
      seek,
      cycleRate: () => setRate((r) => RATES[(RATES.indexOf(r) + 1) % RATES.length]!),
      toggleMute: () => setMuted((m) => !m),
      registerPlayer: (el) => {
        playerEl.current = el;
      },
      scrollToPlayer: () => playerEl.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    }),
    [duration, time, playing, rate, muted, started, activeStepIndex, steps, play, pause, seek],
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function useRecipePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("useRecipePlayer must be used inside <RecipePlayerProvider>");
  return ctx;
}
