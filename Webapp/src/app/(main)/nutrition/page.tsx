import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout";

export const metadata: Metadata = { title: "AI nutritionist" };

export default function Page() {
  return <ComingSoon title="AI nutritionist" note="Full-page chat. The floating widget lands with Screen 2." />;
}
