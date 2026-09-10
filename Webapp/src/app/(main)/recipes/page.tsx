import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout";

export const metadata: Metadata = { title: "Video recipes" };

export default function Page() {
  return <ComingSoon title="Video recipes" note="Full recipe library with filters — next milestone." />;
}
