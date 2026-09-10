"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { Bell, ChevronDown, Heart, LogOut, MessageCircle, Plus, Settings, ShieldCheck, Sparkles, UserPlus, UserRound } from "lucide-react";
import { useAuthModal } from "@/components/providers/auth-modal-provider";
import { useSession } from "@/components/providers/session-provider";
import { Avatar, Badge, Button, ButtonLink } from "@/components/ui";
import { cn } from "@/lib/cn";
import { timeAgo } from "@/lib/format";
import { useDismiss } from "@/lib/hooks/use-dismiss";
import { NOTIFICATIONS, type AppNotification } from "@/lib/mock/notifications";

const KIND_ICON: Record<AppNotification["kind"], typeof Bell> = {
  reply: MessageCircle,
  like: Heart,
  follow: UserPlus,
  system: Sparkles,
};

/**
 * Right-hand cluster of the Navbar.
 * Guest → Log in / Join. Authed → Upload, notifications, avatar menu with role badge.
 */
export function AuthHeader() {
  const { user, role } = useSession();
  const { openAuth } = useAuthModal();

  if (!user) {
    return (
      <div className="flex items-center gap-1.5 sm:gap-2">
        <Button variant="ghost" size="sm" className="hidden sm:inline-flex" onClick={() => openAuth("login")}>
          Log in
        </Button>
        <Button size="sm" onClick={() => openAuth("register")}>
          Join free
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 sm:gap-2">
      <ButtonLink href="/recipes/new" size="sm" variant="secondary" className="hidden md:inline-flex">
        <Plus /> Upload
      </ButtonLink>
      <NotificationsMenu />
      <UserMenu name={user.name} handle={user.handle} isAdmin={role === "admin"} />
    </div>
  );
}

function NotificationsMenu() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(NOTIFICATIONS);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);
  const unread = items.filter((n) => !n.read).length;

  return (
    <div ref={ref} className="relative">
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="relative"
      >
        <Bell />
        {unread > 0 && (
          <span className="absolute top-1.5 right-1.5 grid min-w-4 place-items-center rounded-full bg-amber-500 px-1 text-[10px] leading-4 font-bold text-white ring-2 ring-white">
            {unread}
          </span>
        )}
      </Button>

      {open && (
        <div className="fixed inset-x-3 top-16 z-50 mt-1 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-xl animate-pop-in sm:absolute sm:inset-x-auto sm:top-auto sm:right-0 sm:w-96">
          <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3">
            <p className="font-semibold text-stone-900">Notifications</p>
            <button
              className="text-xs font-medium text-emerald-700 hover:underline disabled:text-stone-400 disabled:no-underline"
              disabled={!unread}
              onClick={() => setItems((xs) => xs.map((n) => ({ ...n, read: true })))}
            >
              Mark all read
            </button>
          </div>
          <ul className="max-h-96 divide-y divide-stone-100 overflow-y-auto">
            {items.map((n) => {
              const Icon = KIND_ICON[n.kind];
              return (
                <li key={n.id} className={cn("flex gap-3 px-4 py-3 hover:bg-stone-50", !n.read && "bg-emerald-50/40")}>
                  <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-stone-100 text-stone-600">
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="text-stone-700">
                      <span className="font-semibold text-stone-900">{n.actor}</span> {n.text}
                    </p>
                    <p className="mt-0.5 text-xs text-stone-400">{timeAgo(n.at)}</p>
                  </div>
                  {!n.read && <span className="mt-2 size-2 shrink-0 rounded-full bg-emerald-500" aria-label="Unread" />}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function UserMenu({ name, handle, isAdmin }: { name: string; handle: string; isAdmin: boolean }) {
  const { signOut } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-full p-0.5 pr-1 transition hover:bg-stone-100 sm:pr-2"
      >
        <Avatar name={name} size="sm" />
        <span className="hidden text-left leading-tight lg:block">
          <span className="block text-sm font-semibold text-stone-900">{name.split(" ")[0]}</span>
          <RoleBadge isAdmin={isAdmin} />
        </span>
        <ChevronDown className="hidden size-4 text-stone-400 sm:block" />
      </button>

      {open && (
        <div role="menu" className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-stone-200 bg-white p-1.5 shadow-xl animate-pop-in">
          <div className="flex items-center gap-3 px-3 py-3">
            <Avatar name={name} />
            <div className="min-w-0">
              <p className="truncate font-semibold text-stone-900">{name}</p>
              <p className="truncate text-xs text-stone-500">@{handle}</p>
            </div>
          </div>
          <div className="px-3 pb-2 lg:hidden">
            <RoleBadge isAdmin={isAdmin} />
          </div>
          <div className="my-1 h-px bg-stone-100" />
          <MenuLink href="/profile" icon={UserRound} label="Profile" onClick={close} />
          <MenuLink href="/settings" icon={Settings} label="Settings" onClick={close} />
          {isAdmin && <MenuLink href="/admin" icon={ShieldCheck} label="Admin console" onClick={close} />}
          <div className="my-1 h-px bg-stone-100" />
          <button
            role="menuitem"
            onClick={() => {
              close();
              signOut();
            }}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-rose-600 hover:bg-rose-50"
          >
            <LogOut className="size-4" /> Log out
          </button>
        </div>
      )}
    </div>
  );
}

function RoleBadge({ isAdmin }: { isAdmin: boolean }) {
  return isAdmin ? (
    <Badge tone="amber">
      <ShieldCheck /> Admin
    </Badge>
  ) : (
    <Badge tone="emerald">Member</Badge>
  );
}

function MenuLink({ href, icon: Icon, label, onClick }: { href: string; icon: typeof Bell; label: string; onClick: () => void }) {
  return (
    <Link role="menuitem" href={href} onClick={onClick} className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-stone-700 hover:bg-stone-100">
      <Icon className="size-4 text-stone-400" /> {label}
    </Link>
  );
}
