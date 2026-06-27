"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { RequireAuth } from "@/components/require-auth";

const subLinks = [
  { href: "/sport", label: "Тренировка дня", datePerDay: true },
  { href: "/sport/catalog", label: "Каталог", datePerDay: true },
  { href: "/sport/calendar", label: "Календарь", datePerDay: false },
  { href: "/sport/progress", label: "Прогресс", datePerDay: false },
];

export default function SportLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <div className="-m-6 flex flex-col">
        <Suspense>
          <SportNav />
        </Suspense>
        <div className="bg-[var(--color-page)] p-7">{children}</div>
      </div>
    </RequireAuth>
  );
}

function SportNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const date = searchParams.get("date");

  return (
    <nav className="flex gap-6 border-b border-[var(--color-border-soft)] bg-white px-7 text-sm">
      {subLinks.map((link) => {
        const isActive = pathname === link.href;
        const href = link.datePerDay && date ? `${link.href}?date=${date}` : link.href;
        return (
          <Link
            key={link.href}
            href={href}
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
  );
}
