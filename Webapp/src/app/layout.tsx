import type { Metadata, Viewport } from "next";
// Self-hosted variable fonts (no Google Fonts fetch at build → works offline / behind proxies).
import "@fontsource-variable/inter";
import "@fontsource-variable/fraunces";
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "VeggieHub — Vegan recipes, community & AI nutrition", template: "%s · VeggieHub" },
  description: "Discover plant-based video recipes, join the vegan community forum, find nearby vegan spots and plan your meals.",
  // Ask Dark Reader not to restyle the app (it injects attrs → hydration mismatch).
  other: { "darkreader-lock": "true" },
};

export const viewport: Viewport = { themeColor: "#047857" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: browser extensions (Dark Reader, Grammarly…) mutate <html>/<body> attrs before hydration.
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans" suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
