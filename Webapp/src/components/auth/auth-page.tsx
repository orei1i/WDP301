"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Star } from "lucide-react";
import { Logo } from "@/components/layout/logo";
import type { AuthMode } from "@/components/providers/auth-modal-provider";
import { AuthForm } from "./auth-form";

/** Full-page auth (deep links like /login?next=/planner). Split layout on lg+. */
export function AuthPage({ initialMode, next = "/" }: { initialMode: AuthMode; next?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState(initialMode);
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-emerald-900 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -top-24 -right-24 size-96 rounded-full bg-emerald-700/40" />
        <div className="pointer-events-none absolute -bottom-32 -left-20 size-96 rounded-full bg-amber-400/15" />
        <div className="relative">
          <Logo tone="light" />
        </div>
        <div className="relative max-w-md">
          <p className="font-display text-4xl leading-tight font-semibold">Cook more plants. Share what works.</p>
          <p className="mt-4 text-emerald-100/80">Video recipes, a friendly forum, nearby vegan spots and an AI nutritionist in your pocket.</p>
        </div>
        <figure className="relative max-w-md rounded-2xl bg-white/10 p-5 backdrop-blur">
          <div className="flex gap-0.5 text-amber-300">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className="size-4 fill-current" />
            ))}
          </div>
          <blockquote className="mt-2 text-sm text-emerald-50">“The meal planner finally made my first vegan month easy. The forum answered every question I had.”</blockquote>
          <figcaption className="mt-2 text-xs text-emerald-200/80">Sample testimonial · placeholder copy</figcaption>
        </figure>
      </div>

      <div className="flex flex-col items-center justify-center px-5 py-10">
        <div className="mb-8 lg:hidden">
          <Logo />
        </div>
        <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl shadow-stone-900/5 ring-1 ring-stone-200/70 sm:p-8">
          <h1 className="font-display text-2xl font-semibold text-stone-900">{mode === "login" ? "Welcome back" : "Join VeggieHub"}</h1>
          <p className="mt-1 mb-6 text-sm text-stone-500">{mode === "login" ? "Log in to your plant-based kitchen." : "Free forever. Takes 30 seconds."}</p>
          <AuthForm
            mode={mode}
            onModeChange={setMode}
            onSuccess={() => router.push(safeNext)}
            onContinueAsGuest={() => router.push(safeNext === "/planner" ? "/" : safeNext)}
          />
        </div>
      </div>
    </div>
  );
}
