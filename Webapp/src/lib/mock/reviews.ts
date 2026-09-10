import type { AuthorRef, ISODate } from "@/types";
import { toAuthor, USERS } from "./users";

export type RecipeReview = {
  id: string;
  recipeId: string;
  author: AuthorRef;
  rating: 1 | 2 | 3 | 4 | 5;
  body: string;
  likes: number;
  madeIt?: boolean;
  createdAt: ISODate;
};

export const REVIEWS: RecipeReview[] = [
  { id: "rv1", recipeId: "r_1", author: toAuthor(USERS.aiko!), rating: 5, madeIt: true, likes: 42, body: "Pressing the tofu really is the secret. I air-fried it at 200 °C for 14 min instead of pan-frying — super crispy.", createdAt: "2026-09-09T12:00:00Z" },
  { id: "rv2", recipeId: "r_1", author: toAuthor(USERS.sam!), rating: 4, madeIt: true, likes: 18, body: "Loved the nước chấm. Used brown rice and added edamame for extra protein. Would halve the chili for kids.", createdAt: "2026-09-08T19:30:00Z" },
  { id: "rv3", recipeId: "r_1", author: toAuthor(USERS.mai!), rating: 5, likes: 7, body: "Found fresh lemongrass at Bến Thành for 10k — the 'where to buy' box was spot on.", createdAt: "2026-09-10T03:15:00Z" },
];

/** Deterministic star distribution derived from average rating (mock). */
export function ratingDistribution(avg: number, count: number): number[] {
  const five = Math.min(0.92, Math.max(0.3, (avg - 3.5) / 1.6));
  const four = (1 - five) * 0.6;
  const three = (1 - five - four) * 0.6;
  const two = (1 - five - four - three) * 0.6;
  const one = 1 - five - four - three - two;
  return [five, four, three, two, one].map((p) => Math.round(p * count));
}
