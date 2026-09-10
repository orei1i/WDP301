import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout";

export const metadata: Metadata = { title: "Nearby vegan spots" };

export default function Page() {
  return <ComingSoon title="Nearby vegan spots" note="Split map + venue list — coming soon." />;
}
