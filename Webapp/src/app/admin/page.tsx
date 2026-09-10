import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout";

export const metadata: Metadata = { title: "Moderation dashboard" };

export default function Page() {
  return <ComingSoon title="Moderation dashboard" note="Flagged posts, videos and comments — coming soon." />;
}
