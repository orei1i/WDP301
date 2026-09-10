import type { Metadata } from "next";
import { AuthPage } from "@/components/auth";

export const metadata: Metadata = { title: "Create account" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <AuthPage initialMode="register" next={next} />;
}
