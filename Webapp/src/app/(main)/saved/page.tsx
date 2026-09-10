import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout";

export const metadata: Metadata = { title: "Saved recipes" };

export default function Page() {
  return <ComingSoon title="Saved recipes" note="Your bookmarked recipes will live here." />;
}
