"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, ApiError } from "@/lib/api";
import { money, monthLabel, shiftMonth, signedMoney } from "@/lib/money";
import type { FinanceAnalytics } from "@/lib/types";

// Enough hues to tell a dozen groups apart, in the muted range the rest of the
// app uses. Assigned by position in the sorted list, so a group keeps its
// colour between the pie and the stacked chart.
const PALETTE = [
  "#2d4a5e",
  "#4d7a63",
  "#8a6a1a",
  "#b5503e",
  "#5e7686",
  "#7a6a8a",
  "#3f6b54",
  "#a8824a",
  "#6b8aa0",
  "#8a5a5a",
  "#4a6a4a",
  "#9a7a6a",
];

const WINDOWS = [
  { months: 6, label: "6 мес" },
  { months: 12, label: "12 мес" },
  { months: 24, label: "24 мес" },
];

export default function FinanceAnalyticsPage() {
  const [months, setMonths] = useState(12);
  // Null until the first answer arrives: the server picks the newest month
  // that has anything in it, which is a better opening view than today's
  // barely-started month and is not knowable here.
  const [month, setMonth] = useState<string | null>(null);
  const [known, setKnown] = useState<string[]>([]);
  const [data, setData] = useState<FinanceAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<string[]>("/api/finance/months")
      .then(setKnown)
      .catch(() => setKnown([]));
  }, []);

  useEffect(() => {
    const query = month ? `?months=${months}&month=${month}` : `?months=${months}`;
    api
      .get<FinanceAnalytics>(`/api/finance/analytics${query}`)
      .then((loaded) => {
        setData(loaded);
        if (month === null) setMonth(loaded.reference_month);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Ошибка загрузки"));
  }, [months, month]);

  const current = month ?? data?.reference_month ?? null;
  const hasEarlier = current !== null && known.some((m) => m < current);
  const hasLater = current !== null && known.some((m) => m > current);

  const colorOf = useMemo(() => {
    const names = data?.by_group.map((g) => g.group) ?? [];
    const map = new Map(names.map((name, index) => [name, PALETTE[index % PALETTE.length]]));
    return (name: string) => map.get(name) ?? "#cdd7dd";
  }, [data]);

  const flow = (data?.months ?? []).map((m) => ({
    month: m.month.slice(2),
    Доходы: m.income,
    Расходы: m.expenses,
    Остаток: m.balance,
  }));

  const stacked = (data?.group_trend ?? []).map((point) => ({
    month: point.month.slice(2),
    ...point.values,
  }));
  const stackedGroups = Object.keys(data?.group_trend?.[0]?.values ?? {});

  const hasData = data && data.months.some((m) => m.income > 0 || m.expenses > 0);

  return (
    <div className="bg-[var(--color-page)] p-4 sm:p-7">
      <div className="mx-auto max-w-4xl">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-ink)]">
            Аналитика
          </h1>
          <div className="flex gap-1.5">
            {WINDOWS.map((w) => (
              <button
                key={w.months}
                onClick={() => setMonths(w.months)}
                className={
                  months === w.months
                    ? "btn-primary py-1 text-[12.5px]"
                    : "btn-secondary py-1 text-[12.5px]"
                }
              >
                {w.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-5 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => current && setMonth(shiftMonth(current, -1))}
              disabled={!hasEarlier}
              className="btn-secondary px-2.5 py-1 text-[12.5px] disabled:opacity-40"
              aria-label="Предыдущий месяц"
            >
              ←
            </button>
            <input
              type="month"
              value={current ?? ""}
              onChange={(e) => e.target.value && setMonth(e.target.value)}
              className="input-field w-auto py-1 text-[12.5px]"
            />
            <button
              onClick={() => current && setMonth(shiftMonth(current, 1))}
              disabled={!hasLater}
              className="btn-secondary px-2.5 py-1 text-[12.5px] disabled:opacity-40"
              aria-label="Следующий месяц"
            >
              →
            </button>
          </div>
          <span className="text-[12px] text-[var(--color-muted)]">
            Месяц задаёт разрезы и топы. Графики по месяцам показывают{" "}
            {months === 6 ? "шесть" : months === 12 ? "двенадцать" : "двадцать четыре"} месяцев до
            него включительно.
          </span>
        </div>

        {error && <p className="mb-4 text-sm text-[#b5503e]">{error}</p>}
        {!data && !error && <p className="text-[var(--color-faint)]">Загружаю…</p>}

        {data && !hasData && (
          <p className="text-[var(--color-faint)]">
            Пока нечего показывать — аналитика считается из трат и доходов, внесённых на вкладке
            «Месяц».
          </p>
        )}

        {data && hasData && (
          <>
            <Totals data={data} />

            <section className="metric-card mb-3.5">
              <h2 className="mb-3.5 text-sm font-semibold text-[var(--color-ink)]">
                Доходы, расходы и остаток по месяцам
              </h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={flow}>
                    <CartesianGrid stroke="#f5f5f1" vertical={false} />
                    <XAxis
                      dataKey="month"
                      fontSize={11}
                      stroke="#9c9c95"
                      tickLine={false}
                      axisLine={{ stroke: "#f0f0ec" }}
                    />
                    <YAxis
                      fontSize={11}
                      stroke="#9c9c95"
                      tickLine={false}
                      axisLine={false}
                      width={56}
                      tickFormatter={(v) => `${Math.round(Number(v) / 1000)}к`}
                    />
                    <Tooltip
                      contentStyle={{ borderRadius: 10, border: "1px solid #e7e7e2", fontSize: 13 }}
                      formatter={(value, name) => [money(Number(value)), String(name)]}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="Доходы" stroke="#4d7a63" strokeWidth={2.5} dot={{ r: 2.5 }} />
                    <Line type="monotone" dataKey="Расходы" stroke="#b5503e" strokeWidth={2.5} dot={{ r: 2.5 }} />
                    <Line type="monotone" dataKey="Остаток" stroke="#2d4a5e" strokeWidth={2} dot={{ r: 2.5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>

            <div className="mb-3.5 grid grid-cols-1 gap-3.5 lg:grid-cols-2">
              <section className="metric-card">
                <h2 className="mb-1 text-sm font-semibold text-[var(--color-ink)]">
                  Куда ушли деньги
                </h2>
                <p className="mb-2 text-[12px] text-[var(--color-faint)]">
                  {monthLabel(data.reference_month)}
                </p>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={data.by_group}
                        dataKey="actual"
                        nameKey="group"
                        innerRadius="45%"
                        outerRadius="78%"
                        paddingAngle={1}
                      >
                        {data.by_group.map((slice) => (
                          <Cell key={slice.group} fill={colorOf(slice.group)} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ borderRadius: 10, border: "1px solid #e7e7e2", fontSize: 13 }}
                        formatter={(value, name) => [money(Number(value)), String(name)]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="mt-1 flex flex-col gap-1">
                  {data.by_group.slice(0, 6).map((slice) => (
                    <li key={slice.group} className="flex items-center gap-2 text-[12.5px]">
                      <span
                        className="h-2.5 w-2.5 flex-shrink-0 rounded-sm"
                        style={{ backgroundColor: colorOf(slice.group) }}
                      />
                      <span className="min-w-0 flex-1 truncate text-[var(--color-ink)]">
                        {slice.group}
                      </span>
                      <span className="flex-shrink-0 font-mono text-[var(--color-muted)]">
                        {slice.share_pct}%
                      </span>
                      <span className="w-[92px] flex-shrink-0 text-right font-mono font-semibold text-[var(--color-ink)]">
                        {money(slice.actual)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="metric-card">
                <h2 className="mb-1 text-sm font-semibold text-[var(--color-ink)]">
                  План против факта
                </h2>
                <p className="mb-2 text-[12px] text-[var(--color-faint)]">
                  {monthLabel(data.reference_month)}, по группам
                </p>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.by_group.slice(0, 8)} layout="vertical">
                      <CartesianGrid stroke="#f5f5f1" horizontal={false} />
                      <XAxis
                        type="number"
                        fontSize={11}
                        stroke="#9c9c95"
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => `${Math.round(Number(v) / 1000)}к`}
                      />
                      <YAxis
                        type="category"
                        dataKey="group"
                        fontSize={10.5}
                        stroke="#9c9c95"
                        tickLine={false}
                        axisLine={false}
                        width={92}
                      />
                      <Tooltip
                        contentStyle={{ borderRadius: 10, border: "1px solid #e7e7e2", fontSize: 13 }}
                        formatter={(value, name) => [
                          money(Number(value)),
                          name === "planned" ? "План" : "Факт",
                        ]}
                      />
                      <Bar dataKey="planned" fill="#cdd7dd" radius={[0, 3, 3, 0]} />
                      <Bar dataKey="actual" fill="#2d4a5e" radius={[0, 3, 3, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>
            </div>

            {stackedGroups.length > 0 && (
              <section className="metric-card mb-3.5">
                <h2 className="mb-3.5 text-sm font-semibold text-[var(--color-ink)]">
                  Структура расходов по месяцам
                </h2>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stacked}>
                      <CartesianGrid stroke="#f5f5f1" vertical={false} />
                      <XAxis
                        dataKey="month"
                        fontSize={11}
                        stroke="#9c9c95"
                        tickLine={false}
                        axisLine={{ stroke: "#f0f0ec" }}
                      />
                      <YAxis
                        fontSize={11}
                        stroke="#9c9c95"
                        tickLine={false}
                        axisLine={false}
                        width={56}
                        tickFormatter={(v) => `${Math.round(Number(v) / 1000)}к`}
                      />
                      <Tooltip
                        contentStyle={{ borderRadius: 10, border: "1px solid #e7e7e2", fontSize: 13 }}
                        formatter={(value, name) => [money(Number(value)), String(name)]}
                      />
                      {stackedGroups.map((group) => (
                        <Bar key={group} dataKey={group} stackId="all" fill={colorOf(group)} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p className="mt-2 text-[12px] text-[var(--color-faint)]">
                  Один столбец — месяц, цвета — группы расходов в том же порядке, что в списке выше.
                </p>
              </section>
            )}

            <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
              <section className="metric-card">
                <h2 className="mb-1 text-sm font-semibold text-[var(--color-ink)]">
                  Самые крупные статьи
                </h2>
                <p className="mb-2.5 text-[12px] text-[var(--color-faint)]">
                  {monthLabel(data.reference_month)}, рядом — средняя за три предыдущих месяца
                </p>
                <ul className="flex flex-col gap-1.5">
                  {data.top_items.map((item) => (
                    <li key={item.item_id} className="flex items-baseline gap-2 text-[13px]">
                      <span className="min-w-0 flex-1">
                        <span className="text-[var(--color-ink)]">{item.name}</span>
                        <span className="ml-1.5 text-[11px] text-[var(--color-faint)]">
                          {item.group}
                        </span>
                      </span>
                      {item.average_3m !== null && (
                        <span className="flex-shrink-0 font-mono text-[11.5px] text-[var(--color-faint)]">
                          ср. {money(item.average_3m)}
                        </span>
                      )}
                      <span className="w-[94px] flex-shrink-0 text-right font-mono font-semibold text-[var(--color-ink)]">
                        {money(item.actual)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="metric-card">
                <h2 className="mb-1 text-sm font-semibold text-[var(--color-ink)]">Перерасход</h2>
                <p className="mb-2.5 text-[12px] text-[var(--color-faint)]">
                  Статьи, где факт вышел за план
                </p>
                {data.overspent.length === 0 ? (
                  <p className="text-[13px] text-[#3f6b54]">
                    Ни одна статья не вышла за план — редкий месяц.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {data.overspent.slice(0, 10).map((item) => (
                      <li key={item.item_id} className="flex items-baseline gap-2 text-[13px]">
                        <span className="min-w-0 flex-1">
                          <span className="text-[var(--color-ink)]">{item.name}</span>
                          <span className="ml-1.5 text-[11px] text-[var(--color-faint)]">
                            {item.group}
                          </span>
                        </span>
                        <span className="flex-shrink-0 font-mono text-[11.5px] text-[var(--color-faint)]">
                          план {money(item.planned)}
                        </span>
                        <span className="w-[86px] flex-shrink-0 text-right font-mono font-semibold text-[#b5503e]">
                          {signedMoney(item.difference)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Totals({ data }: { data: FinanceAnalytics }) {
  const withIncome = data.months.filter((m) => m.income > 0);
  const avgIncome = withIncome.length
    ? withIncome.reduce((s, m) => s + m.income, 0) / withIncome.length
    : null;
  const withSpend = data.months.filter((m) => m.expenses > 0);
  const avgExpenses = withSpend.length
    ? withSpend.reduce((s, m) => s + m.expenses, 0) / withSpend.length
    : null;
  const saved = data.months.reduce((s, m) => s + m.balance, 0);
  const rates = data.months.filter((m) => m.savings_rate !== null);
  const avgRate = rates.length
    ? rates.reduce((s, m) => s + (m.savings_rate ?? 0), 0) / rates.length
    : null;

  return (
    <div className="mb-3.5 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
      <Stat label="Доход в среднем" value={money(avgIncome)} hint="за месяц с доходом" />
      <Stat label="Расход в среднем" value={money(avgExpenses)} hint="за месяц с тратами" />
      <Stat
        label="Накопленный остаток"
        value={signedMoney(saved)}
        hint="за весь период"
        color={saved >= 0 ? "#3f6b54" : "#b5503e"}
      />
      <Stat
        label="Норма сбережений"
        value={avgRate === null ? "—" : `${(avgRate * 100).toFixed(1)}%`}
        hint="доля дохода в сбережения"
      />
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  color,
}: {
  label: string;
  value: string;
  hint?: string;
  color?: string;
}) {
  return (
    <div className="metric-card">
      <p className="text-[11.5px] font-semibold uppercase tracking-wide text-[var(--color-faint)]">
        {label}
      </p>
      <p
        className="mt-1 text-xl font-semibold tracking-tight text-[var(--color-ink)]"
        style={color ? { color } : undefined}
      >
        {value}
      </p>
      {hint && <p className="text-[11.5px] text-[var(--color-faint)]">{hint}</p>}
    </div>
  );
}
