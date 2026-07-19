"use client";

import type { ReactNode } from "react";
import { RequireAuth } from "@/components/require-auth";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return <RequireAuth>{children}</RequireAuth>;
}
