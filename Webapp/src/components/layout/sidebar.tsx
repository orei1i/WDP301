"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Lock, Sparkles } from "lucide-react";
import { useAuthModal } from "@/components/providers/auth-modal-provider";
import { useSession } from "@/components/providers/session-provider";
import { Badge, Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import { FOOD_TYPES } from "@/lib/mock/taxonomy";
import { isActive, MAIN_NAV, type NavItem } from "@/lib/navigation";
import type { SessionRole } from "@/types";

type SidebarProps = { onNavigate?: () => void; className?: string };

export function Sidebar({ onNavigate, className }: SidebarProps) {
  const pathname = usePathname();
  const { role } = useSession();

  return (
    <nav aria-label="Main" className={cn("flex h-full flex-col gap-6 overflow-y-auto px-3 py-5", className)}>
      {MAIN_NAV.filter((s) => !s.visibleTo || s.visibleTo.includes(role)).map((section, i) => (
        <div key={section.title ?? i}>
          {section.title && (
            <p className="mb-2 px-3 text-[11px] font-semibold tracking-wider text-stone-400 uppercase">{section.title}</p>
          )}
          <ul className="space-y-0.5">
            {section.items
              .filter((it) => !it.visibleTo || it.visibleTo.includes(role))
              .map((item) => (
                <li key={item.href}>
                  <SidebarLink item={item} role={role} active={isActive(pathname, item.href)} onNavigate={onNavigate} />
                </li>
              ))}
          </ul>
        </div>
      ))}

      <div>
        <p className="mb-2 px-3 text-[11px] font-semibold tracking-wider text-stone-400 uppercase">Browse by diet</p>
        <div className="flex flex-wrap gap-1.5 px-3">
          {FOOD_TYPES.map((ft) => (
            <Link
              key={ft.id}
              href={`/recipes?diet=${ft.slug}`}
              onClick={onNavigate}
              className="rounded-full border border-stone-200 bg-white px-2.5 py-1 text-xs text-stone-600 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800"
            >
              {ft.name}
            </Link>
          ))}
        </div>
      </div>

      {role === "guest" && <GuestCta onNavigate={onNavigate} />}

      <div className="mt-auto">
        <DemoRoleSwitcher />
      </div>
    </nav>
  );
}

function SidebarLink({ item, role, active, onNavigate }: { item: NavItem; role: SessionRole; active: boolean; onNavigate?: () => void }) {
  const locked = item.lockedFor?.includes(role);
  const Icon = item.icon;
  return (
    <Link
      href={locked ? `/login?next=${encodeURIComponent(item.href)}` : item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
        active ? "bg-emerald-50 text-emerald-800" : "text-stone-600 hover:bg-stone-100 hover:text-stone-900",
      )}
    >
      <Icon className={cn("size-[18px] shrink-0", active ? "text-emerald-700" : "text-stone-400 group-hover:text-stone-600")} />
      <span className="flex-1 truncate">{item.label}</span>
      {locked ? (
        <Lock className="size-3.5 text-stone-300" aria-label="Login required" />
      ) : item.badge ? (
        <Badge tone={/^\d+$/.test(item.badge) ? "rose" : "amber"}>{item.badge}</Badge>
      ) : null}
    </Link>
  );
}

function GuestCta({ onNavigate }: { onNavigate?: () => void }) {
  const { openAuth } = useAuthModal();
  return (
    <div className="relative mx-1 overflow-hidden rounded-2xl bg-emerald-800 p-4 text-white">
      <div className="pointer-events-none absolute -top-8 -right-8 size-28 rounded-full bg-emerald-600/50" />
      <div className="pointer-events-none absolute -right-2 -bottom-10 size-24 rounded-full bg-amber-400/25" />
      <Sparkles className="relative size-5 text-amber-300" />
      <p className="relative mt-2 font-display text-base font-semibold leading-snug">Plan your week, save recipes, ask the AI.</p>
      <p className="relative mt-1 text-xs text-emerald-100/80">Free forever for the community.</p>
      <Button
        variant="accent"
        size="sm"
        className="relative mt-3 w-full"
        onClick={() => {
          onNavigate?.();
          openAuth("register");
        }}
      >
        Create free account
      </Button>
    </div>
  );
}

/** DEV ONLY — preview the UI as each role while there is no backend. */
function DemoRoleSwitcher() {
  const { role, signInAs, signOut } = useSession();
  const opts: SessionRole[] = ["guest", "user", "admin"];
  return (
    <div className="mx-1 rounded-xl border border-dashed border-stone-300 p-2">
      <p className="px-1 pb-1.5 text-[10px] font-semibold tracking-wider text-stone-400 uppercase">Preview as</p>
      <div className="grid grid-cols-3 gap-1 rounded-lg bg-stone-100 p-0.5">
        {opts.map((r) => (
          <button
            key={r}
            onClick={() => (r === "guest" ? signOut() : signInAs(r))}
            className={cn(
              "rounded-md py-1 text-xs font-medium capitalize transition",
              role === r ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-800",
            )}
          >
            {r}
          </button>
        ))}
      </div>
    </div>
  );
}
