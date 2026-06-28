"use client";

import { useEffect, useState } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, ApiError } from "@/lib/api";
import type { DayScorePoint, ReportSummary, TagImpact } from "@/lib/types";

export default function ReportsPage() {
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [dayScores, setDayScores] = useState<DayScorePoint[]>([]);
  const [tagImpact, setTagImpact] = useState<TagImpact[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<ReportSummary>("/api/reports/summary"),
      api.get<DayScorePoint[]>("/api/reports/day-scores"),
      api.get<TagImpact[]>("/api/reports/tag-impact"),
    ])
      .then(([summaryData, dayScoreData, tagImpactData]) => {
        setSummary(summaryData);
        setDayScores(dayScoreData);
        setTagImpact(tagImpactData);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Ошибка загрузки отчётов"));
  }, []);

  const chartData = dayScores.map((point) => ({
    date: point.entry_date.slice(5),
    score: point.day_score,
  }));

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-5 text-2xl font-semibold tracking-tight text-[var(--color-ink)]">Отчётность</h1>
      {error && <p className="mb-4 text-sm text-[#b5503e]">{error}</p>}

      {summary && (
        <div className="mb-3.5 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <Stat label="Средняя оценка дня · 7 дней" value={summary.avg_day_score_7d} />
          <Stat label="Средняя оценка дня · 30 дней" value={summary.avg_day_score_30d} />
        </div>
      )}

      <section className="metric-card mb-3.5">
        <h2 className="mb-3.5 text-sm font-semibold text-[var(--color-ink)]">Динамика оценки дня</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <XAxis dataKey="date" fontSize={11} stroke="#9c9c95" tickLine={false} axisLine={{ stroke: "#f0f0ec" }} />
              <YAxis
                domain={[0, 10]}
                fontSize={11}
                stroke="#9c9c95"
                tickLine={false}
                axisLine={false}
                width={24}
              />
              <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e7e7e2", fontSize: 13 }} />
              <Line type="monotone" dataKey="score" stroke="#2d4a5e" strokeWidth={2.5} dot={{ r: 3, fill: "#2d4a5e" }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="metric-card mb-3.5">
        <h2 className="mb-1 text-sm font-semibold text-[var(--color-ink)]">Привычки за 30 дней</h2>
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11.5px] font-semibold uppercase tracking-wide text-[var(--color-faint)]">
              <th className="border-b border-[var(--color-border-soft)] py-2.5">Привычка</th>
              <th className="border-b border-[var(--color-border-soft)] py-2.5 text-right">Средняя</th>
              <th className="border-b border-[var(--color-border-soft)] py-2.5 text-right">Серия</th>
            </tr>
          </thead>
          <tbody>
            {summary?.habits.map((habit) => (
              <tr key={habit.habit_id} className="border-b border-[#f5f5f1]">
                <td className="py-2.5">{habit.habit_name}</td>
                <td className="py-2.5 text-right font-mono font-semibold">
                  {habit.avg_score_30d?.toFixed(1) ?? "—"}
                </td>
                <td className="py-2.5 text-right font-mono text-[13px] text-[var(--color-muted)]">
                  {habit.current_streak_days} дн.
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>

      <section className="metric-card">
        <h2 className="mb-0.5 text-sm font-semibold text-[var(--color-ink)]">Влияние тегов на оценку дня</h2>
        <p className="mb-1.5 text-xs text-[var(--color-faint)]">
          Сравнение средней оценки дня в дни с тегом и без него. Сильное отклонение выделено цветом.
        </p>
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11.5px] font-semibold uppercase tracking-wide text-[var(--color-faint)]">
              <th className="border-b border-[var(--color-border-soft)] py-2.5">Тег</th>
              <th className="border-b border-[var(--color-border-soft)] py-2.5 text-right">С тегом</th>
              <th className="border-b border-[var(--color-border-soft)] py-2.5 text-right">Без тега</th>
              <th className="border-b border-[var(--color-border-soft)] py-2.5 text-right">Δ</th>
              <th className="border-b border-[var(--color-border-soft)] py-2.5 text-right">Дней</th>
            </tr>
          </thead>
          <tbody>
            {tagImpact.map((row) => {
              const delta =
                row.avg_score_with_tag !== null && row.avg_score_without_tag !== null
                  ? row.avg_score_with_tag - row.avg_score_without_tag
                  : null;
              const isStrong = delta !== null && Math.abs(delta) >= 1.5;
              const isUp = delta !== null && delta >= 0;
              return (
                <tr key={row.tag} className="border-b border-[#f5f5f1]">
                  <td className="py-2.5">{row.tag}</td>
                  <td className="py-2.5 text-right font-mono font-semibold">
                    {row.avg_score_with_tag?.toFixed(1) ?? "—"}
                  </td>
                  <td className="py-2.5 text-right font-mono text-[var(--color-muted)]">
                    {row.avg_score_without_tag?.toFixed(1) ?? "—"}
                  </td>
                  <td className="py-2.5 text-right">
                    {delta !== null && (
                      <span
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-1 font-mono text-[13px] ${
                          isUp ? "text-[#3f6b54]" : "text-[#b5503e]"
                        } ${isStrong ? (isUp ? "bg-[#e6eee7] font-semibold" : "bg-[#f4e2dd] font-semibold") : ""}`}
                      >
                        {isUp ? "↑" : "↓"} {isUp ? "+" : "−"}
                        {Math.abs(delta).toFixed(1)}
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 text-right font-mono text-[13px] text-[var(--color-faint)]">
                    {row.days_with_tag}
                  </td>
                </tr>
              );
            })}
            {tagImpact.length === 0 && (
              <tr>
                <td colSpan={5} className="py-3 text-[var(--color-faint)]">
                  Пока нет тегов в дневнике.
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

function Stat({ label, value }: { label: string; value: number | null | undefined }) {
  return (
    <div className="metric-card">
      <p className="text-[12.5px] text-[var(--color-muted)]">{label}</p>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className="text-[34px] font-semibold leading-none tracking-tight text-[var(--color-ink)]">
          {value?.toFixed(1) ?? "—"}
        </span>
        <span className="text-[15px] font-normal text-[var(--color-faint)]">/ 10</span>
      </div>
    </div>
  );
}
