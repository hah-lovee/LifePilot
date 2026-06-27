"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { RequireAdmin } from "@/components/require-admin";

const subLinks = [
  { href: "/admin", label: "Пользователи" },
  { href: "/admin/catalog", label: "Каталог" },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <RequireAdmin>
      <div className="-m-6 flex flex-col">
        <nav className="flex gap-6 border-b border-[var(--color-border-soft)] bg-white px-7 text-sm">
          {subLinks.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={
                  isActive
                    ? "-mb-px border-b-2 border-[var(--color-accent)] py-[13px] font-semibold text-[var(--color-accent)]"
                    : "-mb-px border-b-2 border-transparent py-[13px] font-medium text-[var(--color-muted)] hover:text-[var(--color-ink)]"
                }
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        <div className="bg-[var(--color-page)] p-7">{children}</div>
      </div>
    </RequireAdmin>
  );
}
