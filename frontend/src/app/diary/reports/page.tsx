"use client";

import { useEffect, useState } from "react";
import { Legend, Line, LineChart, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import { api, ApiError } from "@/lib/api";
import type { DayScorePoint, ReportSummary, SleepSummary, TagImpact } from "@/lib/types";

export default function ReportsPage() {
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [dayScores, setDayScores] = useState<DayScorePoint[]>([]);
  const [tagImpact, setTagImpact] = useState<TagImpact[]>([]);
  const [sleep, setSleep] = useState<SleepSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hiddenStateKeys, setHiddenStateKeys] = useState<Set<string>>(new Set());

  function toggleStateKey(key: string) {
    setHiddenStateKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  useEffect(() => {
    Promise.all([
      api.get<ReportSummary>("/api/reports/summary"),
      api.get<DayScorePoint[]>("/api/reports/day-scores"),
      api.get<TagImpact[]>("/api/reports/tag-impact"),
      api.get<SleepSummary>("/api/reports/sleep"),
    ])
      .then(([summaryData, dayScoreData, tagImpactData, sleepData]) => {
        setSummary(summaryData);
        setDayScores(dayScoreData);
        setTagImpact(tagImpactData);
        setSleep(sleepData);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Ошибка загрузки отчётов"));
  }, []);

  const chartData = dayScores.map((point) => ({
    date: point.entry_date.slice(5),
    score: point.day_score,
  }));

  const stateChartData = dayScores
    .filter((p) => p.energy !== null || p.mood !== null || p.body_condition !== null || p.sleep_score !== null)
    .map((point) => {
      const values = [point.energy, point.mood, point.body_condition, point.sleep_score].filter(
        (v): v is number => v !== null
      );
      const average = values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : null;
      return {
        date: point.entry_date.slice(5),
        energy: point.energy,
        mood: point.mood,
        body_condition: point.body_condition,
        sleep_score: point.sleep_score,
        average,
      };
    });

  const QUALITY_ORDER = ["отличный", "хороший", "нормальный", "плохой"];
  const QUALITY_COLORS: Record<string, string> = {
    отличный: "#3f6b54",
    хороший: "#4d7a63",
    нормальный: "#8a6a1a",
    плохой: "#b5503e",
  };

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

      {/* Состояние: энергия, настроение, самочувствие */}
      {summary && (
        <section className="metric-card mb-3.5">
          <h2 className="mb-3.5 text-sm font-semibold text-[var(--color-ink)]">Состояние</h2>

          <div className="mb-3.5 grid grid-cols-1 gap-3.5 sm:grid-cols-3">
            <StateStat label="Энергия · 7 / 30 дней" v7={summary.state.avg_energy_7d} v30={summary.state.avg_energy_30d} />
            <StateStat label="Настроение · 7 / 30 дней" v7={summary.state.avg_mood_7d} v30={summary.state.avg_mood_30d} />
            <StateStat
              label="Самочувствие · 7 / 30 дней"
              v7={summary.state.avg_body_condition_7d}
              v30={summary.state.avg_body_condition_30d}
            />
          </div>

          {stateChartData.length > 0 ? (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stateChartData}>
                  <XAxis dataKey="date" fontSize={11} stroke="#9c9c95" tickLine={false} axisLine={{ stroke: "#f0f0ec" }} />
                  <YAxis domain={[0, 10]} fontSize={11} stroke="#9c9c95" tickLine={false} axisLine={false} width={24} />
                  <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e7e7e2", fontSize: 12 }} />
                  <Legend
                    wrapperStyle={{ fontSize: 11, cursor: "pointer" }}
                    onClick={(entry: any) => toggleStateKey(String(entry.dataKey))}
                    formatter={(value: string, entry: any) => {
                      const hidden = hiddenStateKeys.has(String(entry.dataKey));
                      return (
                        <span style={{ opacity: hidden ? 0.4 : 1, textDecoration: hidden ? "line-through" : "none" }}>
                          {value}
                        </span>
                      );
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="energy"
                    name="Энергия"
                    stroke="#2d4a5e"
                    strokeWidth={2}
                    dot={{ r: 2 }}
                    connectNulls
                    hide={hiddenStateKeys.has("energy")}
                  />
                  <Line
                    type="monotone"
                    dataKey="mood"
                    name="Настроение"
                    stroke="#9c7a33"
                    strokeWidth={2}
                    dot={{ r: 2 }}
                    connectNulls
                    hide={hiddenStateKeys.has("mood")}
                  />
                  <Line
                    type="monotone"
                    dataKey="body_condition"
                    name="Самочувствие"
                    stroke="#3f6b54"
                    strokeWidth={2}
                    dot={{ r: 2 }}
                    connectNulls
                    hide={hiddenStateKeys.has("body_condition")}
                  />
                  <Line
                    type="monotone"
                    dataKey="sleep_score"
                    name="Сон"
                    stroke="#7a6ea3"
                    strokeWidth={2}
                    dot={{ r: 2 }}
                    connectNulls
                    hide={hiddenStateKeys.has("sleep_score")}
                  />
                  <Line
                    type="monotone"
                    dataKey="average"
                    name="Среднее"
                    stroke="#b5503e"
                    strokeWidth={2.5}
                    strokeDasharray="4 3"
                    dot={false}
                    connectNulls
                    hide={hiddenStateKeys.has("average")}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-[var(--color-faint)]">
              Пока нет данных — заполняй вкладку «Состояние» в дневнике.
            </p>
          )}
        </section>
      )}

      {/* Сон */}
      {sleep && sleep.days_with_data > 0 && (
        <section className="metric-card mb-3.5">
          <h2 className="mb-3.5 text-sm font-semibold text-[var(--color-ink)]">Сон</h2>

          <div className="mb-4 grid grid-cols-3 gap-3">
            <div>
              <p className="text-[11.5px] text-[var(--color-muted)]">Среднее время сна</p>
              <p className="mt-0.5 text-[22px] font-semibold leading-none text-[var(--color-ink)]">
                {sleep.avg_sleep_hours?.toFixed(1)}ч
              </p>
            </div>
            <div>
              <p className="text-[11.5px] text-[var(--color-muted)]">Засыпаю</p>
              <p className="mt-0.5 text-[22px] font-semibold leading-none text-[var(--color-ink)]">
                {sleep.avg_bedtime ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-[11.5px] text-[var(--color-muted)]">Просыпаюсь</p>
              <p className="mt-0.5 text-[22px] font-semibold leading-none text-[var(--color-ink)]">
                {sleep.avg_wakeup ?? "—"}
              </p>
            </div>
          </div>

          {/* Влияние качества сна на оценку дня */}
          <p className="mb-2 text-[12px] font-semibold text-[var(--color-muted)]">
            Средняя оценка дня по качеству сна
          </p>
          <div className="mb-4 flex flex-wrap gap-2">
            {QUALITY_ORDER.map((q) => {
              const score = sleep.score_by_quality[q];
              if (score === null || score === undefined) return null;
              return (
                <div key={q} className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                    style={{ background: QUALITY_COLORS[q] }}
                  />
                  <span className="text-[12px] text-[var(--color-muted)] capitalize">{q}</span>
                  <span className="text-[13px] font-semibold text-[var(--color-ink)]">{score.toFixed(1)}</span>
                </div>
              );
            })}
          </div>

          {/* Scatter: часы сна → оценка дня */}
          {sleep.points.filter((p) => p.day_score !== null).length >= 3 && (
            <>
              <p className="mb-2 text-[12px] font-semibold text-[var(--color-muted)]">
                Часы сна → оценка дня
              </p>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
                    <XAxis
                      type="number"
                      dataKey="sleep_hours"
                      name="Часы"
                      domain={[4, 10]}
                      fontSize={11}
                      stroke="#9c9c95"
                      tickLine={false}
                      axisLine={{ stroke: "#f0f0ec" }}
                      label={{ value: "часов сна", position: "insideBottom", offset: -2, fontSize: 10, fill: "#9c9c95" }}
                    />
                    <YAxis
                      type="number"
                      dataKey="day_score"
                      name="Оценка"
                      domain={[0, 10]}
                      fontSize={11}
                      stroke="#9c9c95"
                      tickLine={false}
                      axisLine={false}
                      width={24}
                    />
                    <Tooltip
                      contentStyle={{ borderRadius: 10, border: "1px solid #e7e7e2", fontSize: 12 }}
                      formatter={(value: any, name: any) => [
                        name === "Часы" ? `${value}ч` : value,
                        name === "Часы" ? "Сон" : "Оценка дня",
                      ]}
                    />
                    <Scatter
                      data={sleep.points.filter((p) => p.day_score !== null)}
                      fill="#2d4a5e"
                      opacity={0.6}
                    />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            </>
          )}

          <p className="mt-1 text-[11px] text-[var(--color-faint)]">
            Данных: {sleep.days_with_data} дн.
          </p>
        </section>
      )}

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

function StateStat({ label, v7, v30 }: { label: string; v7: number | null; v30: number | null }) {
  return (
    <div className="metric-card">
      <p className="text-[12.5px] text-[var(--color-muted)]">{label}</p>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="text-[22px] font-semibold leading-none tracking-tight text-[var(--color-ink)]">
          {v7?.toFixed(1) ?? "—"}
        </span>
        <span className="text-[13px] text-[var(--color-faint)]">/</span>
        <span className="text-[16px] font-medium leading-none text-[var(--color-muted)]">
          {v30?.toFixed(1) ?? "—"}
        </span>
      </div>
    </div>
  );
}
