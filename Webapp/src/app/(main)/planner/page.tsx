import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout";

export const metadata: Metadata = { title: "Weekly meal planner" };

export default function Page() {
  return <ComingSoon title="Weekly meal planner" note="7-day matrix with BMI & calorie goal — coming soon." />;
}
