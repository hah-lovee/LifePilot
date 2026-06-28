"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { DividendEvent } from "@/lib/types";

export default function InvestmentDividendsPage() {
  const [events, setEvents] = useState<DividendEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<DividendEvent[]>("/api/investments/dividends")
      .then(setEvents)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Ошибка загрузки дивидендов"));
  }, []);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1.5 text-2xl font-semibold tracking-tight text-[var(--color-ink)]">Дивиденды и купоны</h1>
      <p className="mb-5 max-w-[560px] text-[13px] leading-relaxed text-[var(--color-muted)]">
        Предстоящие выплаты по текущим позициям брокерского счёта на ближайшие 90 дней.
      </p>
      {error && <p className="mb-4 text-sm text-[#b5503e]">{error}</p>}

      <section className="metric-card">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11.5px] font-semibold uppercase tracking-wide text-[var(--color-faint)]">
              <th className="border-b border-[var(--color-border-soft)] py-2.5">Дата</th>
              <th className="border-b border-[var(--color-border-soft)] py-2.5">Инструмент</th>
              <th className="border-b border-[var(--color-border-soft)] py-2.5 text-right">На бумагу</th>
              <th className="border-b border-[var(--color-border-soft)] py-2.5 text-right">Итого</th>
            </tr>
          </thead>
          <tbody>
            {events.map((ev, i) => (
              <tr key={`${ev.ticker}-${ev.payment_date}-${i}`} className="border-b border-[#f5f5f1]">
                <td className="py-2.5 font-mono text-[13px]">{ev.payment_date}</td>
                <td className="py-2.5">
                  {ev.name}
                  <span className="ml-1.5 rounded-md bg-[#f2f2ee] px-1.5 py-0.5 text-[11px] text-[var(--color-faint)]">
                    {ev.instrument_type === "bond" ? "купон" : "дивиденд"}
                  </span>
                </td>
                <td className="py-2.5 text-right font-mono">
                  {ev.amount_per_unit.toFixed(2)} {ev.currency}
                </td>
                <td className="py-2.5 text-right font-mono font-semibold">
                  {ev.total_amount.toFixed(2)} {ev.currency}
                </td>
              </tr>
            ))}
            {events.length === 0 && (
              <tr>
                <td colSpan={4} className="py-3 text-[var(--color-faint)]">
                  Выплат не предвидится в ближайшие 90 дней — либо ещё не подключён брокерский счёт.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </section>
    </div>
  );
}
