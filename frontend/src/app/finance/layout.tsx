"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { RequireAuth } from "@/components/require-auth";

const subLinks = [
  { href: "/finance", label: "Месяц" },
  { href: "/finance/analytics", label: "Аналитика" },
  { href: "/finance/savings", label: "Накопления" },
  { href: "/finance/items", label: "Статьи" },
  { href: "/finance/investments", label: "Инвестиции" },
];

export default function FinanceLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <RequireAuth>
      <div className="-m-3 flex flex-col sm:-m-6">
        <nav className="flex gap-4 overflow-x-auto border-b border-[var(--color-border-soft)] bg-white px-4 text-sm sm:gap-6 sm:px-7">
          {subLinks.map((link) => {
            // Инвестиции has pages of its own below it, so it stays highlighted
            // while you are inside them; the others are single pages.
            const isActive =
              link.href === "/finance" ? pathname === link.href : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={
                  isActive
                    ? "-mb-px flex-shrink-0 border-b-2 border-[var(--color-accent)] py-[13px] font-semibold text-[var(--color-accent)]"
                    : "-mb-px flex-shrink-0 border-b-2 border-transparent py-[13px] font-medium text-[var(--color-muted)] hover:text-[var(--color-ink)]"
                }
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        {children}
      </div>
    </RequireAuth>
  );
}
