"use client";

import { useMemo, useState } from "react";
import { PenSquare } from "lucide-react";
import { useSession } from "@/components/providers/session-provider";
import { ButtonLink, Card, Chip, SectionHeader } from "@/components/ui";
import { cn } from "@/lib/cn";
import { FORUM_CATEGORIES } from "@/lib/mock/taxonomy";
import type { ForumCategory, ForumPost } from "@/types";
import { ForumThreadCard } from "./forum-thread-card";

type Tab = "latest" | "top" | "unanswered";

export function ForumFeed({ posts }: { posts: ForumPost[] }) {
  const { role } = useSession();
  const [category, setCategory] = useState<ForumCategory | "all">("all");
  const [tab, setTab] = useState<Tab>("latest");

  const visible = useMemo(() => {
    let list = posts.filter((p) => p.status === "published" && (category === "all" || p.category === category));
    if (tab === "unanswered") list = list.filter((p) => !p.isSolved && !p.isPinned);
    const lastActivity = (p: ForumPost) => +new Date(p.lastReply?.at ?? p.createdAt);
    list = [...list].sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1; // pinned always on top
      return tab === "top" ? b.upvotes - a.upvotes : lastActivity(b) - lastActivity(a);
    });
    return list;
  }, [posts, category, tab]);

  return (
    <section aria-labelledby="forum-heading" className="space-y-4">
      <SectionHeader
        eyebrow="Community"
        title="Forum discussions"
        description="Ask, share and review — from 120k plant-based members."
        action={
          <ButtonLink href={role === "guest" ? "/login?next=/forum/new" : "/forum/new"} size="sm">
            <PenSquare /> New thread
          </ButtonLink>
        }
      />

      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <Chip size="sm" active={category === "all"} onClick={() => setCategory("all")}>
          All topics
        </Chip>
        {FORUM_CATEGORIES.map((c) => (
          <Chip key={c.value} size="sm" active={category === c.value} onClick={() => setCategory(c.value)}>
            {c.label}
          </Chip>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div role="tablist" aria-label="Sort threads" className="flex border-b border-stone-100 px-2 sm:px-3">
          {(["latest", "top", "unanswered"] as Tab[]).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn(
                "relative px-3 py-3 text-sm font-medium capitalize transition-colors",
                tab === t
                  ? "text-emerald-800 after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:rounded-full after:bg-emerald-600"
                  : "text-stone-500 hover:text-stone-800",
              )}
            >
              {t}
            </button>
          ))}
          <span className="ml-auto hidden items-center pr-2 text-xs text-stone-400 sm:flex">{visible.length} threads</span>
        </div>

        {visible.length ? (
          <div className="divide-y divide-stone-100">
            {visible.map((p) => (
              <ForumThreadCard key={p.id} post={p} />
            ))}
          </div>
        ) : (
          <p className="px-6 py-12 text-center text-sm text-stone-500">Nothing here yet — start the conversation.</p>
        )}

        <div className="border-t border-stone-100 bg-stone-50/60 px-5 py-3 text-center">
          <ButtonLink href="/forum" variant="ghost" size="sm" className="text-emerald-700">
            Browse all discussions
          </ButtonLink>
        </div>
      </Card>
    </section>
  );
}
