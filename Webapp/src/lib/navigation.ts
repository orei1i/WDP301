import {
  Bookmark,
  CalendarDays,
  Compass,
  FolderTree,
  MapPin,
  MessagesSquare,
  PlayCircle,
  ShieldCheck,
  Sparkles,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import type { SessionRole } from "@/types";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Roles that can see the item. Omit = everyone. */
  visibleTo?: SessionRole[];
  /** Roles that see it but locked (prompts login). */
  lockedFor?: SessionRole[];
  badge?: string;
};

export type NavSection = { title?: string; items: NavItem[]; visibleTo?: SessionRole[] };

export const MAIN_NAV: NavSection[] = [
  {
    items: [
      { href: "/", label: "Discover", icon: Compass },
      { href: "/recipes", label: "Video recipes", icon: PlayCircle },
      { href: "/forum", label: "Forum", icon: MessagesSquare },
      { href: "/nearby", label: "Nearby shops", icon: MapPin },
      { href: "/planner", label: "Meal planner", icon: CalendarDays, lockedFor: ["guest"] },
      { href: "/nutrition", label: "AI nutritionist", icon: Sparkles, badge: "Beta" },
    ],
  },
  {
    title: "Your space",
    visibleTo: ["user", "admin"],
    items: [{ href: "/saved", label: "Saved recipes", icon: Bookmark }],
  },
  {
    title: "Administration",
    visibleTo: ["admin"],
    items: [
      { href: "/admin", label: "Moderation", icon: ShieldCheck, badge: "12" },
      { href: "/admin/roles", label: "Roles & permissions", icon: UsersRound },
      { href: "/admin/categories", label: "Categories", icon: FolderTree },
    ],
  },
];

/** Mobile bottom tab bar (max 5). `null` href = centre "create" action. */
export const MOBILE_TABS: NavItem[] = [
  { href: "/", label: "Discover", icon: Compass },
  { href: "/forum", label: "Forum", icon: MessagesSquare },
  { href: "/nearby", label: "Nearby", icon: MapPin },
  { href: "/planner", label: "Planner", icon: CalendarDays, lockedFor: ["guest"] },
];

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
