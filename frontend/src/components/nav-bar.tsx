"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

const links = [
  { href: "/diary", label: "Дневник", datePerDay: true },
  { href: "/sport", label: "Спорт", datePerDay: true },
  { href: "/investments", label: "Инвестиции", datePerDay: false },
];

export function NavBar() {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return null;

  return (
    <Suspense>
      <NavBarContent />
    </Suspense>
  );
}

function NavBarContent() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const date = searchParams.get("date");

  const allLinks = user?.is_admin ? [...links, { href: "/admin", label: "Админка", datePerDay: false }] : links;

  return (
    <nav className="flex items-center justify-between border-b border-[var(--color-border)] bg-white px-6 py-3">
      <div className="flex items-center gap-8">
        <Link href="/diary" className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-[7px] bg-[var(--color-accent)] text-[13px] font-semibold text-white">
            L
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-[var(--color-ink)]">Life Pilot</span>
        </Link>
        <div className="flex gap-6">
          {allLinks.map((link) => {
            const isActive = pathname.startsWith(link.href);
            const href = link.datePerDay && date ? `${link.href}?date=${date}` : link.href;
            return (
              <Link
                key={link.href}
                href={href}
                className={
                  isActive
                    ? "border-b-2 border-[var(--color-ink)] pb-[3px] text-sm font-semibold text-[var(--color-ink)]"
                    : "border-b-2 border-transparent pb-[3px] text-sm font-medium text-[var(--color-faint)] hover:text-[var(--color-ink)]"
                }
              >
                {link.label}
              </Link>
            );
          })}
        </div>
      </div>
      <button onClick={logout} className="text-[13px] text-[var(--color-faint)] hover:text-[var(--color-ink)]">
        Выйти
      </button>
    </nav>
  );
}
