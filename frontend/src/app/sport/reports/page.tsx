"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, ApiError } from "@/lib/api";
import type { SportReport } from "@/lib/types";

const READY = "#3f6b54";
const ALMOST = "#8a6a1a";
const RESTING = "#b5503e";

export default function SportReportsPage() {
  const [report, setReport] = useState<SportReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<SportReport>("/api/reports/sport")
      .then(setReport)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Ошибка загрузки отчёта"));
  }, []);

  // A group that has been trained at some point but not in the last 30 days is
  // missing from the load table entirely — which is exactly the thing worth
  // saying out loud.
  const untrained = useMemo(() => {
    if (!report) return [];
    const recent = new Set(report.load_30d.map((g) => g.group));
    return report.readiness.filter((r) => !recent.has(r.group)).map((r) => r.group);
  }, [report]);

  const weeklyData =
    report?.weekly.map((w) => ({
      week: w.week_start.slice(5),
      sets: w.sets,
      volume: Math.round(w.volume),
    })) ?? [];

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight text-[var(--color-ink)]">Отчёты</h1>
      <p className="mb-5 text-[13px] text-[var(--color-muted)]">
        Прогресс по отдельному упражнению — на его собственной странице: нажмите на название в тренировке или в
        каталоге.
      </p>

      {error && <p className="mb-4 text-sm text-[#b5503e]">{error}</p>}
      {!report && !error && <p className="text-[var(--color-faint)]">Загружаю…</p>}

      {report && report.exercises.length === 0 && (
        <p className="text-[var(--color-faint)]">
          Пока нет ни одной записанной тренировки — отчёты появятся после первой.
        </p>
      )}

      {report && report.exercises.length > 0 && (
        <>
          <div className="mb-3.5 grid grid-cols-2 gap-3.5 sm:grid-cols-4">
            <Stat label="Тренировок за 30 дней" value={String(report.frequency.sessions_30d)} />
            <Stat
              label="В неделю"
              value={report.frequency.sessions_per_week.toFixed(1)}
              hint="в среднем за 8 недель"
            />
            <Stat
              label="С последней"
              value={
                report.frequency.days_since_last === null
                  ? "—"
                  : report.frequency.days_since_last === 0
                    ? "сегодня"
                    : `${report.frequency.days_since_last} дн.`
              }
            />
            <Stat
              label="Самый долгий перерыв"
              value={report.frequency.longest_gap_days === null ? "—" : `${report.frequency.longest_gap_days} дн.`}
              hint="за полгода"
            />
          </div>

          <section className="metric-card mb-3.5">
            <h2 className="mb-1 text-sm font-semibold text-[var(--color-ink)]">Готовность групп мышц</h2>
            <p className="mb-3.5 text-[12px] leading-relaxed text-[var(--color-faint)]">
              Сколько группа отдыхает против того, сколько ей положено. Норма задаётся в админке (ориентиры: 72 ч
              для спины, груди и ног, 48 ч для рук и плеч, 24 ч для пресса) и автоматически растягивается на
              четверть, если последняя тренировка была заметно объёмнее обычной, либо сокращается, если легче.
              Счёт идёт в целых днях — тренировки записываются датой, без времени.
            </p>
            <ul className="flex flex-col gap-2.5">
              {report.readiness.map((r) => {
                const color = r.readiness_pct >= 100 ? READY : r.readiness_pct >= 50 ? ALMOST : RESTING;
                return (
                  <li key={r.group}>
                    <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-[13px] font-medium text-[var(--color-ink)]">{r.group}</span>
                      <span className="text-[12px]" style={{ color }}>
                        {r.ready_in_days === 0 ? "готова" : `ещё ${r.ready_in_days} дн.`}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-[#f0f0ec]">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${r.readiness_pct}%`, backgroundColor: color }}
                      />
                    </div>
                    <p className="mt-1 text-[11.5px] text-[var(--color-faint)]">
                      {r.last_trained} · {r.days_since} дн. назад · {r.sets_last_session} подх. при обычных{" "}
                      {r.typical_sets} · норма {r.recovery_hours} ч
                      {r.recovery_hours !== r.base_recovery_hours && ` (база ${r.base_recovery_hours})`}
                    </p>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3.5 text-[11.5px] leading-relaxed text-[var(--color-faint)]">
              Важная оговорка: у упражнения указана одна группа мышц — основная. Подтягивания считаются спиной и
              никак не бицепсом, поэтому руки могут быть уставшее, чем показано здесь.
            </p>
          </section>

          <section className="metric-card mb-3.5">
            <h2 className="mb-1 text-sm font-semibold text-[var(--color-ink)]">Нагрузка за 30 дней</h2>
            <p className="mb-3.5 text-[12px] text-[var(--color-faint)]">
              Подходы — основная мера: у подтягиваний и пресса нет веса, и в тоннаж они не попадают вовсе.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11.5px] font-semibold uppercase tracking-wide text-[var(--color-faint)]">
                    <th className="border-b border-[var(--color-border-soft)] py-2.5">Группа</th>
                    <th className="border-b border-[var(--color-border-soft)] py-2.5 text-right">Тренировок</th>
                    <th className="border-b border-[var(--color-border-soft)] py-2.5 text-right">Подходов</th>
                    <th className="border-b border-[var(--color-border-soft)] py-2.5 text-right">Доля</th>
                    <th className="border-b border-[var(--color-border-soft)] py-2.5 text-right">Тоннаж</th>
                  </tr>
                </thead>
                <tbody>
                  {report.load_30d.map((g) => (
                    <tr key={g.group} className="border-b border-[#f5f5f1]">
                      <td className="py-2.5">{g.group}</td>
                      <td className="py-2.5 text-right font-mono text-[13px]">{g.sessions}</td>
                      <td className="py-2.5 text-right font-mono font-semibold">{g.sets}</td>
                      <td className="py-2.5 text-right font-mono text-[13px] text-[var(--color-muted)]">
                        {g.share_pct}%
                      </td>
                      <td className="py-2.5 text-right font-mono text-[13px] text-[var(--color-muted)]">
                        {g.volume > 0 ? `${Math.round(g.volume).toLocaleString("ru-RU")} кг` : "—"}
                      </td>
                    </tr>
                  ))}
                  {report.load_30d.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-3 text-[var(--color-faint)]">
                        За последние 30 дней тренировок не было.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {untrained.length > 0 && (
              <p className="mt-3 text-[12px] text-[#8a6a1a]">
                Не тренировалось за 30 дней: {untrained.join(", ")}.
              </p>
            )}
          </section>

          <section className="metric-card mb-3.5">
            <h2 className="mb-3.5 text-sm font-semibold text-[var(--color-ink)]">Объём по неделям</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={weeklyData}>
                  <CartesianGrid stroke="#f5f5f1" vertical={false} />
                  <XAxis
                    dataKey="week"
                    fontSize={11}
                    stroke="#9c9c95"
                    tickLine={false}
                    axisLine={{ stroke: "#f0f0ec" }}
                  />
                  <YAxis
                    yAxisId="sets"
                    fontSize={11}
                    stroke="#9c9c95"
                    tickLine={false}
                    axisLine={false}
                    width={30}
                  />
                  <YAxis
                    yAxisId="volume"
                    orientation="right"
                    fontSize={11}
                    stroke="#9c9c95"
                    tickLine={false}
                    axisLine={false}
                    width={52}
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: 10, border: "1px solid #e7e7e2", fontSize: 13 }}
                    formatter={(value, name) =>
                      name === "sets"
                        ? [`${value}`, "Подходы"]
                        : [`${Number(value).toLocaleString("ru-RU")} кг`, "Тоннаж"]
                    }
                    labelFormatter={(label) => `Неделя с ${label}`}
                  />
                  <Bar yAxisId="sets" dataKey="sets" fill="#cdd7dd" radius={[4, 4, 0, 0]} />
                  <Line
                    yAxisId="volume"
                    type="monotone"
                    dataKey="volume"
                    stroke="#2d4a5e"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: "#2d4a5e" }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-2 text-[12px] text-[var(--color-faint)]">
              Столбцы — подходы, линия — тоннаж (вес × повторы). Пустая неделя показана нулём: пропуски видны.
            </p>
          </section>

          <section className="metric-card">
            <h2 className="mb-1 text-sm font-semibold text-[var(--color-ink)]">Прогресс упражнений</h2>
            <p className="mb-3.5 text-[12px] text-[var(--color-faint)]">
              Изменение — лучший вес за последние 8 недель против лучшего за 8 недель до них. «Стоит» — упражнение
              делается, но рекорд не двигался больше двух месяцев.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11.5px] font-semibold uppercase tracking-wide text-[var(--color-faint)]">
                    <th className="border-b border-[var(--color-border-soft)] py-2.5">Упражнение</th>
                    <th className="border-b border-[var(--color-border-soft)] py-2.5 text-right">Рекорд</th>
                    <th className="border-b border-[var(--color-border-soft)] py-2.5 text-right">Изменение</th>
                    <th className="border-b border-[var(--color-border-soft)] py-2.5 text-right">Последний раз</th>
                  </tr>
                </thead>
                <tbody>
                  {report.exercises.map((ex) => (
                    <tr key={ex.exercise_id} className="border-b border-[#f5f5f1]">
                      <td className="py-2.5">
                        <Link
                          href={`/sport/exercise/${ex.exercise_id}`}
                          className="font-medium text-[var(--color-ink)] underline decoration-[#cdd7dd] decoration-1 underline-offset-[3px] hover:decoration-[var(--color-accent)]"
                        >
                          {ex.name}
                        </Link>
                        {ex.muscle_group && (
                          <span className="ml-1.5 text-[11.5px] text-[var(--color-faint)]">
                            {ex.muscle_group}
                          </span>
                        )}
                        {ex.stale && <span className="ml-1.5 text-[11.5px] text-[#8a6a1a]">стоит</span>}
                      </td>
                      <td className="py-2.5 text-right font-mono font-semibold">
                        {ex.best_weight === null ? "—" : `${ex.best_weight} кг`}
                      </td>
                      <td className="py-2.5 text-right font-mono text-[13px]">
                        <Delta value={ex.delta} />
                      </td>
                      <td className="py-2.5 text-right font-mono text-[13px] text-[var(--color-muted)]">
                        {ex.last_done.slice(5)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Delta({ value }: { value: number | null }) {
  if (value === null) return <span className="text-[var(--color-faint)]">—</span>;
  if (value === 0) return <span className="text-[var(--color-muted)]">0</span>;
  return (
    <span style={{ color: value > 0 ? READY : RESTING }}>
      {value > 0 ? "+" : ""}
      {value} кг
    </span>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="metric-card">
      <p className="text-[11.5px] font-semibold uppercase tracking-wide text-[var(--color-faint)]">{label}</p>
      <p className="mt-1 text-xl font-semibold tracking-tight text-[var(--color-ink)]">{value}</p>
      {hint && <p className="text-[11.5px] text-[var(--color-faint)]">{hint}</p>}
    </div>
  );
}
