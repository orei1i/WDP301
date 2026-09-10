"use client";

import { useEffect, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { AiChatWidget } from "@/components/ai";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import { Logo } from "./logo";
import { MobileTabBar } from "./mobile-tab-bar";
import { Navbar } from "./navbar";
import { Sidebar } from "./sidebar";

/**
 * Public/user shell:
 *  - lg+: sticky Navbar + fixed 240px Sidebar + content
 *  - <lg: Navbar (hamburger) + slide-over drawer Sidebar + bottom MobileTabBar
 */
export function AppShell({ children }: { children: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawerOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [drawerOpen]);

  return (
    <div className="min-h-dvh bg-stone-50">
      <Navbar onOpenMenu={() => setDrawerOpen(true)} />

      <div className="flex">
        {/* Desktop sidebar */}
        <aside className="sticky top-16 hidden h-[calc(100dvh-4rem)] w-60 shrink-0 border-r border-stone-200/70 bg-white/60 lg:block">
          <Sidebar />
        </aside>

        <main className="min-w-0 flex-1 pb-24 lg:pb-10">{children}</main>
      </div>

      {/* Mobile drawer */}
      <div className={cn("fixed inset-0 z-50 lg:hidden", drawerOpen ? "pointer-events-auto" : "pointer-events-none")} aria-hidden={!drawerOpen}>
        <div
          className={cn("absolute inset-0 bg-stone-950/40 transition-opacity", drawerOpen ? "opacity-100" : "opacity-0")}
          onClick={() => setDrawerOpen(false)}
        />
        <aside
          className={cn(
            "absolute inset-y-0 left-0 flex w-[84%] max-w-xs flex-col bg-white shadow-2xl transition-transform duration-300 ease-out",
            drawerOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="flex h-16 items-center justify-between border-b border-stone-100 px-4">
            <Logo />
            <Button variant="ghost" size="icon" aria-label="Close menu" onClick={() => setDrawerOpen(false)}>
              <X />
            </Button>
          </div>
          <Sidebar onNavigate={() => setDrawerOpen(false)} className="flex-1" />
        </aside>
      </div>

      <MobileTabBar />
      <AiChatWidget />
    </div>
  );
}
