"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { RequireAuth } from "@/components/require-auth";

const subLinks = [
  { href: "/diary", label: "Запись", datePerDay: true },
  { href: "/diary/calendar", label: "Календарь", datePerDay: false },
  { href: "/diary/habits", label: "Привычки", datePerDay: true },
  { href: "/diary/tags", label: "Теги", datePerDay: false },
  { href: "/diary/reports", label: "Отчётность", datePerDay: false },
];

export default function DiaryLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <div className="-m-3 flex flex-col sm:-m-6">
        <Suspense>
          <DiaryNav />
        </Suspense>
        <div className="bg-[var(--color-page)] p-4 sm:p-7">{children}</div>
      </div>
    </RequireAuth>
  );
}

function DiaryNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const date = searchParams.get("date");

  return (
    <nav className="flex gap-4 overflow-x-auto border-b border-[var(--color-border-soft)] bg-white px-4 text-sm sm:gap-6 sm:px-7">
      {subLinks.map((link) => {
        const isActive = pathname === link.href;
        const href = link.datePerDay && date ? `${link.href}?date=${date}` : link.href;
        return (
          <Link
            key={link.href}
            href={href}
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
  );
}
