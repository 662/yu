import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AuthScreen } from "@/features/book/auth-screen";
import { getCurrentUser } from "@/lib/auth";
import { oidcConfigured } from "@/lib/oidc";

async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getCurrentUser()) redirect("/");
  const { error } = await searchParams;
  return <AuthScreen configured={oidcConfigured()} error={error} />;
}
export default function Page({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  return <Suspense fallback={<div className="opening-book" role="status">正在打开账本…</div>}><Login searchParams={searchParams} /></Suspense>;
}
