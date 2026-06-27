"use client";

import { useEffect, useState } from "react";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { api, ApiError } from "@/lib/api";
import type { DiversificationBreakdown, DiversificationSlice } from "@/lib/types";

const COLORS = ["#2d4a5e", "#5e8aa8", "#9c7a33", "#3f6b54", "#b5503e", "#7a6ea3", "#a3a39c", "#cdd7dd"];

export default function InvestmentDiversificationPage() {
  const [data, setData] = useState<DiversificationBreakdown | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<DiversificationBreakdown>("/api/investments/diversification")
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Ошибка загрузки диверсификации"));
  }, []);

  const isEmpty =
    data && data.by_currency.length === 0 && data.by_source.length === 0 && data.by_sector.length === 0;

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-5 text-2xl font-semibold tracking-tight text-[var(--color-ink)]">Диверсификация</h1>
      {error && <p className="mb-4 text-sm text-[#b5503e]">{error}</p>}
      {isEmpty && (
        <p className="text-[var(--color-faint)]">Нет данных — подключите биржу или брокера на вкладке «Подключения».</p>
      )}

      {data && !isEmpty && (
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
          <DiversificationPie title="По валюте" slices={data.by_currency} />
          <DiversificationPie title="По брокеру/бирже" slices={data.by_source} />
          <DiversificationPie title="По сектору" slices={data.by_sector} />
        </div>
      )}
    </div>
  );
}

function DiversificationPie({ title, slices }: { title: string; slices: DiversificationSlice[] }) {
  return (
    <section className="metric-card">
      <h2 className="mb-3.5 text-sm font-semibold text-[var(--color-ink)]">{title}</h2>
      {slices.length === 0 ? (
        <p className="text-[13px] text-[var(--color-faint)]">Нет данных.</p>
      ) : (
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={slices} dataKey="value_rub" nameKey="label" innerRadius={35} outerRadius={70}>
                {slices.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value) => `${Math.round(Number(value)).toLocaleString("ru-RU")} ₽`}
                contentStyle={{ borderRadius: 10, border: "1px solid #e7e7e2", fontSize: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
