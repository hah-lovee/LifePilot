"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const subLinks = [
  { href: "/finance/investments", label: "Портфель" },
  { href: "/finance/investments/dividends", label: "Дивиденды" },
  { href: "/finance/investments/diversification", label: "Диверсификация" },
  { href: "/finance/investments/connections", label: "Подключения" },
];

/** A second row of tabs under the Финансы one. The outer finance layout owns
 *  RequireAuth and the page frame, so this adds only the row itself. */
export default function InvestmentsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <>
      <nav className="flex gap-4 overflow-x-auto border-b border-[var(--color-border-soft)] bg-[#fbfbfa] px-4 text-[13px] sm:gap-6 sm:px-7">
        {subLinks.map((link) => {
          const isActive = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={
                isActive
                  ? "-mb-px flex-shrink-0 border-b-2 border-[var(--color-ink)] py-2.5 font-semibold text-[var(--color-ink)]"
                  : "-mb-px flex-shrink-0 border-b-2 border-transparent py-2.5 font-medium text-[var(--color-faint)] hover:text-[var(--color-ink)]"
              }
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
      <div className="bg-[var(--color-page)] p-4 sm:p-7">{children}</div>
    </>
  );
}
