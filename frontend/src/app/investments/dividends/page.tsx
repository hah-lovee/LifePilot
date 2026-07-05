"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, ApiError, getCachedData, setCachedData } from "@/lib/api";
import type { DividendEvent, MonthlyIncome } from "@/lib/types";

const CACHE_TTL = 10 * 60 * 1000;

function formatRub(value: number): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(value);
}

const MONTH_NAMES: Record<string, string> = {
  "01": "Янв", "02": "Фев", "03": "Мар", "04": "Апр",
  "05": "Май", "06": "Июн", "07": "Июл", "08": "Авг",
  "09": "Сен", "10": "Окт", "11": "Ноя", "12": "Дек",
};

export default function InvestmentDividendsPage() {
  const [events, setEvents] = useState<DividendEvent[]>(
    () => getCachedData<DividendEvent[]>("investments_dividends", CACHE_TTL) ?? []
  );
  const [monthly, setMonthly] = useState<MonthlyIncome[]>(
    () => getCachedData<MonthlyIncome[]>("investments_monthly", CACHE_TTL) ?? []
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<DividendEvent[]>("/api/investments/dividends"),
      api.get<MonthlyIncome[]>("/api/investments/dividends/monthly"),
    ])
      .then(([evs, mo]) => {
        setEvents(evs);
        setMonthly(mo);
        setCachedData("investments_dividends", evs);
        setCachedData("investments_monthly", mo);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Ошибка загрузки дивидендов"));
  }, []);

  const annualTotal = monthly.reduce((s, m) => s + m.total_rub, 0);
  const avgMonthly = monthly.length > 0 ? annualTotal / 12 : 0;
  const nextEvent = events[0] ?? null;

  const chartData = monthly.map((m) => ({
    label: MONTH_NAMES[m.month.slice(5)] ?? m.month.slice(5),
    total: Math.round(m.total_rub),
    month: m.month,
  }));

  // Текущий месяц для подсветки
  const currentMonth = new Date().toISOString().slice(0, 7);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1.5 text-2xl font-semibold tracking-tight text-[var(--color-ink)]">Дивиденды и купоны</h1>
      <p className="mb-5 max-w-[560px] text-[13px] leading-relaxed text-[var(--color-muted)]">
        Предстоящие выплаты по текущим позициям брокерского счёта на 365 дней вперёд.
      </p>
      {error && <p className="mb-4 text-sm text-[#b5503e]">{error}</p>}

      {/* Сводные карточки */}
      {annualTotal > 0 && (
        <div className="mb-3.5 grid grid-cols-3 gap-3.5">
          <div className="metric-card">
            <p className="text-[12.5px] text-[var(--color-muted)]">Прогноз / год</p>
            <div className="mt-1.5 flex items-baseline gap-1">
              <span className="text-[22px] font-semibold leading-none tracking-tight text-[var(--color-ink)]">
                {formatRub(annualTotal)}
              </span>
              <span className="text-[12px] text-[var(--color-faint)]">₽</span>
            </div>
          </div>
          <div className="metric-card">
            <p className="text-[12.5px] text-[var(--color-muted)]">Среднее / месяц</p>
            <div className="mt-1.5 flex items-baseline gap-1">
              <span className="text-[22px] font-semibold leading-none tracking-tight text-[var(--color-ink)]">
                {formatRub(avgMonthly)}
              </span>
              <span className="text-[12px] text-[var(--color-faint)]">₽</span>
            </div>
          </div>
          <div className="metric-card">
            <p className="text-[12.5px] text-[var(--color-muted)]">Ближайшая выплата</p>
            {nextEvent ? (
              <div className="mt-1.5">
                <p className="text-[14px] font-semibold leading-tight text-[var(--color-ink)]">{nextEvent.name}</p>
                <p className="text-[12px] text-[var(--color-muted)]">
                  {nextEvent.payment_date} · {formatRub(nextEvent.total_amount)} ₽
                </p>
              </div>
            ) : (
              <p className="mt-1.5 text-[14px] text-[var(--color-faint)]">—</p>
            )}
          </div>
        </div>
      )}

      {/* Гистограмма по месяцам */}
      {chartData.length > 0 && (
        <section className="metric-card mb-3.5">
          <h2 className="mb-3.5 text-sm font-semibold text-[var(--color-ink)]">
            Выплаты по месяцам (на год вперёд)
          </h2>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barSize={24}>
                <XAxis dataKey="label" fontSize={11} stroke="#9c9c95" tickLine={false} axisLine={false} />
                <YAxis
                  fontSize={11}
                  stroke="#9c9c95"
                  tickLine={false}
                  axisLine={false}
                  width={48}
                  tickFormatter={(v) => `${formatRub(v)}`}
                />
                <Tooltip
                  contentStyle={{ borderRadius: 10, border: "1px solid #e7e7e2", fontSize: 12 }}
                  formatter={(value: any) => [`${formatRub(Number(value))} ₽`, "Выплаты"]}
                />
                <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry) => (
                    <Cell
                      key={entry.month}
                      fill={entry.month === currentMonth ? "#2d4a5e" : "#9ec0d8"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* Таблица */}
      <section className="metric-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11.5px] font-semibold uppercase tracking-wide text-[var(--color-faint)]">
                <th className="border-b border-[var(--color-border-soft)] py-2.5">Дата</th>
                <th className="border-b border-[var(--color-border-soft)] py-2.5">Инструмент</th>
                <th className="border-b border-[var(--color-border-soft)] py-2.5 text-right">На бумагу</th>
                <th className="border-b border-[var(--color-border-soft)] py-2.5 text-right">Кол-во</th>
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
                  <td className="py-2.5 text-right font-mono text-[var(--color-muted)]">
                    {ev.quantity_held}
                  </td>
                  <td className="py-2.5 text-right font-mono font-semibold">
                    {formatRub(ev.total_amount)} ₽
                  </td>
                </tr>
              ))}
              {events.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-3 text-[var(--color-faint)]">
                    Выплат не предвидится в ближайшие 365 дней — либо ещё не подключён брокерский счёт.
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
