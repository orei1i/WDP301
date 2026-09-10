import Link from "next/link";
import { CheckCircle2, Eye, Flame, MapPin, MessageCircle, Pin, ThumbsUp } from "lucide-react";
import { Avatar, AvatarStack, Badge, type BadgeTone } from "@/components/ui";
import { cn } from "@/lib/cn";
import { compactNumber, timeAgo } from "@/lib/format";
import { FORUM_CATEGORIES } from "@/lib/mock/taxonomy";
import type { ForumCategory, ForumPost } from "@/types";

const CATEGORY_TONE: Record<ForumCategory, BadgeTone> = {
  general: "stone",
  recipes: "emerald",
  nutrition: "sky",
  restaurants: "amber",
  travel: "rose",
  newbies: "emerald",
};

const categoryLabel = (c: ForumCategory) => FORUM_CATEGORIES.find((x) => x.value === c)?.label ?? c;

/** HappyCow-style forum row: author · title/excerpt · stats column · last reply. */
export function ForumThreadCard({ post }: { post: ForumPost }) {
  return (
    <article className={cn("group relative flex gap-3 px-4 py-4 transition-colors hover:bg-stone-50 sm:gap-4 sm:px-5", post.isPinned && "bg-amber-50/40")}>
      <Avatar name={post.author.name} src={post.author.avatarUrl} verified={post.author.isVerified} className="mt-0.5 hidden sm:inline-flex" />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {post.isPinned && (
            <Badge tone="amber" variant="solid">
              <Pin /> Pinned
            </Badge>
          )}
          <Badge tone={CATEGORY_TONE[post.category]}>{categoryLabel(post.category)}</Badge>
          {post.isHot && (
            <Badge tone="rose">
              <Flame /> Hot
            </Badge>
          )}
          {post.isSolved && (
            <Badge tone="emerald">
              <CheckCircle2 /> Answered
            </Badge>
          )}
        </div>

        <h3 className="mt-1.5 text-[15px] leading-snug font-semibold text-stone-900 group-hover:text-emerald-800 sm:text-base">
          <Link href={`/forum/${post.slug}`} className="after:absolute after:inset-0 focus-visible:outline-none">
            {post.title}
          </Link>
        </h3>
        <p className="mt-1 line-clamp-2 text-sm text-stone-500">{post.excerpt}</p>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-stone-500">
          <span className="inline-flex items-center gap-1.5">
            <Avatar name={post.author.name} size="xs" className="sm:hidden" />
            <span className="font-medium text-stone-700">{post.author.name}</span>
            <span>· {timeAgo(post.createdAt)}</span>
          </span>
          {post.location && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5" /> {post.location}
            </span>
          )}
          {/* Inline stats on mobile */}
          <span className="inline-flex items-center gap-1 sm:hidden">
            <MessageCircle className="size-3.5" /> {post.replies}
          </span>
          <span className="inline-flex items-center gap-1 sm:hidden">
            <ThumbsUp className="size-3.5" /> {post.upvotes}
          </span>
          <span className="hidden gap-1.5 md:inline-flex">
            {post.tags.slice(0, 3).map((t) => (
              <span key={t} className="text-emerald-700">
                #{t}
              </span>
            ))}
          </span>
        </div>
      </div>

      {/* Stats + last reply column (sm+) */}
      <div className="hidden w-40 shrink-0 flex-col items-end justify-between gap-3 sm:flex">
        <dl className="flex gap-4 text-right">
          <Stat icon={MessageCircle} label="Replies" value={post.replies} strong />
          <Stat icon={Eye} label="Views" value={post.views} />
        </dl>
        {post.lastReply && (
          <div className="flex items-center gap-2">
            {post.participants && <AvatarStack people={post.participants} />}
            <p className="text-right text-[11px] leading-tight text-stone-400">
              last reply
              <br />
              <span className="text-stone-500">{timeAgo(post.lastReply.at)}</span>
            </p>
          </div>
        )}
      </div>
    </article>
  );
}

function Stat({ icon: Icon, label, value, strong }: { icon: typeof Eye; label: string; value: number; strong?: boolean }) {
  return (
    <div>
      <dt className="sr-only">{label}</dt>
      <dd className={cn("flex items-center justify-end gap-1 text-sm tabular-nums", strong ? "font-semibold text-stone-800" : "text-stone-500")}>
        <Icon className="size-3.5 text-stone-400" /> {compactNumber(value)}
      </dd>
      <p className="text-[10px] tracking-wide text-stone-400 uppercase">{label}</p>
    </div>
  );
}
