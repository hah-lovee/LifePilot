"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { RequireAuth } from "@/components/require-auth";

const subLinks = [
  { href: "/investments", label: "Портфель" },
  { href: "/investments/dividends", label: "Дивиденды" },
  { href: "/investments/diversification", label: "Диверсификация" },
  { href: "/investments/connections", label: "Подключения" },
];

export default function InvestmentsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <RequireAuth>
      <div className="-m-3 flex flex-col sm:-m-6">
        <nav className="flex gap-4 overflow-x-auto border-b border-[var(--color-border-soft)] bg-white px-4 text-sm sm:gap-6 sm:px-7">
          {subLinks.map((link) => {
            const isActive = pathname === link.href;
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
        <div className="bg-[var(--color-page)] p-4 sm:p-7">{children}</div>
      </div>
    </RequireAuth>
  );
}
