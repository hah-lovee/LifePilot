"use client";

import { RequireAuth } from "@/components/require-auth";

export default function InvestmentsPage() {
  return (
    <RequireAuth>
      <div className="-m-6 flex min-h-[calc(100vh-57px)] items-center justify-center bg-[var(--color-page)] p-7">
        <div className="max-w-[420px] text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-[18px] border border-[var(--color-border)] bg-white text-2xl">
            📈
          </div>
          <h1 className="text-xl font-semibold text-[var(--color-ink)]">Инвестиции — модуль в разработке</h1>
          <p className="mt-2.5 text-sm leading-relaxed text-[var(--color-muted)]">
            Здесь будет портфель с интеграцией к биржам и банку: автоматическая подгрузка сделок, баланс и
            динамика. Пока модуль готовится.
          </p>
          <div className="mt-[18px] inline-flex gap-1.5 text-xs text-[var(--color-muted)]">
            <span className="rounded-md border border-[var(--color-border)] bg-white px-2.5 py-1">Биржи</span>
            <span className="rounded-md border border-[var(--color-border)] bg-white px-2.5 py-1">Банк</span>
            <span className="rounded-md border border-[var(--color-border)] bg-white px-2.5 py-1">Портфель</span>
          </div>
        </div>
      </div>
    </RequireAuth>
  );
}
