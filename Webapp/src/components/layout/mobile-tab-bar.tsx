"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { useAuthModal } from "@/components/providers/auth-modal-provider";
import { useSession } from "@/components/providers/session-provider";
import { cn } from "@/lib/cn";
import { isActive, MOBILE_TABS, type NavItem } from "@/lib/navigation";

const FAB =
  "-mt-5 grid size-14 place-items-center rounded-full bg-emerald-600 text-white shadow-lg shadow-emerald-900/25 ring-4 ring-white transition active:scale-95";

/** Bottom tab bar for < lg. Centre FAB = upload (authed) or join (guest). */
export function MobileTabBar() {
  const pathname = usePathname();
  const { role } = useSession();
  const { openAuth } = useAuthModal();
  const [left, right] = [MOBILE_TABS.slice(0, 2), MOBILE_TABS.slice(2)];

  const renderTab = (item: NavItem) => {
    const locked = item.lockedFor?.includes(role);
    const active = isActive(pathname, item.href);
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={locked ? `/login?next=${encodeURIComponent(item.href)}` : item.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium",
          active ? "text-emerald-700" : "text-stone-500",
        )}
      >
        <Icon className={cn("size-[22px]", active && "stroke-[2.4]")} />
        {item.label}
      </Link>
    );
  };

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-stone-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <div className="mx-auto flex max-w-md items-end px-2">
        {left.map(renderTab)}
        <div className="flex flex-1 justify-center">
          {role === "guest" ? (
            <button onClick={() => openAuth("register")} aria-label="Join VeggieHub" className={FAB}>
              <Plus className="size-6" strokeWidth={2.5} />
            </button>
          ) : (
            <Link href="/recipes/new" aria-label="Upload recipe" className={FAB}>
              <Plus className="size-6" strokeWidth={2.5} />
            </Link>
          )}
        </div>
        {right.map(renderTab)}
      </div>
    </nav>
  );
}
