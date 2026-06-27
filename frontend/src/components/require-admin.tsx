"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (!user) router.replace("/login");
    else if (!user.is_admin) router.replace("/diary");
  }, [isLoading, user, router]);

  if (isLoading || !user?.is_admin) return null;
  return <>{children}</>;
}
