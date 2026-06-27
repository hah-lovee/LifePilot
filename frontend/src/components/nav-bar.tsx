"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

const links = [
  { href: "/diary", label: "Дневник" },
  { href: "/sport", label: "Спорт" },
  { href: "/investments", label: "Инвестиции" },
];

export function NavBar() {
  const { user, isAuthenticated, logout } = useAuth();
  const pathname = usePathname();
  if (!isAuthenticated) return null;

  const allLinks = user?.is_admin ? [...links, { href: "/admin", label: "Админка" }] : links;

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
            return (
              <Link
                key={link.href}
                href={link.href}
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
