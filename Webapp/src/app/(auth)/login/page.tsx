import type { Metadata } from "next";
import { AuthPage } from "@/components/auth";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <AuthPage initialMode="login" next={next} />;
}
