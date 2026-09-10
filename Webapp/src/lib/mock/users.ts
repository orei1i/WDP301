import type { AuthorRef, User, UserRole } from "@/types";

export const ROLES: UserRole[] = [
  {
    id: "role_admin",
    name: "Admin",
    slug: "admin",
    description: "Full access to moderation, users, roles and categories.",
    permissions: [
      "content:create",
      "content:edit:own",
      "content:delete",
      "content:moderate",
      "comments:moderate",
      "users:manage",
      "roles:manage",
      "categories:manage",
      "ai:unlimited",
    ],
    isSystem: true,
    color: "amber",
  },
  {
    id: "role_user",
    name: "User",
    slug: "user",
    description: "Community member. Can post recipes, threads and use the planner.",
    permissions: ["content:create", "content:edit:own"],
    isSystem: true,
    color: "emerald",
  },
  {
    id: "role_chef",
    name: "Verified Chef",
    slug: "verified-chef",
    description: "Trusted creators with unlimited AI queries.",
    permissions: ["content:create", "content:edit:own", "ai:unlimited"],
    isSystem: false,
    color: "sky",
  },
];

export const USERS: Record<string, User> = {
  linh: {
    id: "u_linh",
    name: "Linh Nguyen",
    handle: "linh.greens",
    role: "verified-chef",
    location: "Ho Chi Minh City",
    joinedAt: "2024-03-02T00:00:00Z",
    stats: { recipes: 48, posts: 132, followers: 12400 },
  },
  marco: {
    id: "u_marco",
    name: "Marco Bianchi",
    handle: "plantbasedmarco",
    role: "verified-chef",
    location: "Milan",
    joinedAt: "2023-11-19T00:00:00Z",
    stats: { recipes: 71, posts: 40, followers: 30900 },
  },
  aiko: {
    id: "u_aiko",
    name: "Aiko Tanaka",
    handle: "aiko.eats",
    role: "user",
    location: "Osaka",
    joinedAt: "2025-01-10T00:00:00Z",
    stats: { recipes: 12, posts: 88, followers: 2100 },
  },
  sam: {
    id: "u_sam",
    name: "Sam Okafor",
    handle: "samcooksplants",
    role: "user",
    location: "London",
    joinedAt: "2025-06-22T00:00:00Z",
    stats: { recipes: 5, posts: 61, followers: 640 },
  },
  mai: {
    id: "u_mai",
    name: "Mai Tran",
    handle: "maitran",
    role: "user",
    location: "Hanoi",
    joinedAt: "2026-02-14T00:00:00Z",
    stats: { recipes: 2, posts: 9, followers: 85 },
  },
  admin: {
    id: "u_admin",
    name: "Hana Le",
    handle: "hana.admin",
    role: "admin",
    location: "Da Nang",
    joinedAt: "2023-01-01T00:00:00Z",
    stats: { recipes: 9, posts: 310, followers: 1500 },
  },
};

export function toAuthor(u: User, isVerified = u.role === "verified-chef"): AuthorRef {
  return { id: u.id, name: u.name, handle: u.handle, avatarUrl: u.avatarUrl, isVerified };
}

/** Logged-in demo accounts for the mock session switcher. */
export const DEMO_ACCOUNTS = { user: USERS.mai!, admin: USERS.admin! } as const;
