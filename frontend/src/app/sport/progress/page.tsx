"use client";

import { useEffect, useState } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, ApiError } from "@/lib/api";
import type { Exercise, ExerciseLog } from "@/lib/types";

export default function SportProgressPage() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [exerciseId, setExerciseId] = useState<number | null>(null);
  const [logs, setLogs] = useState<ExerciseLog[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Exercise[]>("/api/exercises")
      .then((list) => {
        setExercises(list);
        if (list.length > 0) setExerciseId(list[0].id);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Ошибка загрузки упражнений"));
  }, []);

  useEffect(() => {
    if (exerciseId === null) return;
    api
      .get<ExerciseLog[]>(`/api/exercises/${exerciseId}/logs`)
      .then(setLogs)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Ошибка загрузки истории"));
  }, [exerciseId]);

  const byDateMaxWeight = new Map<string, number>();
  for (const log of logs) {
    if (log.weight === null) continue;
    const current = byDateMaxWeight.get(log.log_date) ?? 0;
    if (log.weight > current) byDateMaxWeight.set(log.log_date, log.weight);
  }
  const chartData = Array.from(byDateMaxWeight.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, weight]) => ({ date: date.slice(5), weight }));

  const recentLogs = [...logs].sort((a, b) => b.log_date.localeCompare(a.log_date)).slice(0, 15);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-5 text-2xl font-semibold tracking-tight text-[var(--color-ink)]">Прогресс</h1>
      {error && <p className="mb-4 text-sm text-[#b5503e]">{error}</p>}

      <select
        value={exerciseId ?? ""}
        onChange={(e) => setExerciseId(Number(e.target.value))}
        className="input-field mb-3.5 w-auto"
      >
        {exercises.map((ex) => (
          <option key={ex.id} value={ex.id}>
            {ex.name}
          </option>
        ))}
      </select>

      {exercises.length === 0 && (
        <p className="text-[var(--color-faint)]">Пока нет упражнений — добавьте их на странице «Мои упражнения».</p>
      )}

      {exercises.length > 0 && (
        <>
          <section className="metric-card mb-3.5">
            <h2 className="mb-3.5 text-sm font-semibold text-[var(--color-ink)]">Максимальный вес по датам</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <XAxis dataKey="date" fontSize={11} stroke="#9c9c95" tickLine={false} axisLine={{ stroke: "#f0f0ec" }} />
                  <YAxis fontSize={11} stroke="#9c9c95" tickLine={false} axisLine={false} width={32} />
                  <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e7e7e2", fontSize: 13 }} />
                  <Line type="monotone" dataKey="weight" stroke="#2d4a5e" strokeWidth={2.5} dot={{ r: 3, fill: "#2d4a5e" }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="metric-card">
            <h2 className="mb-1 text-sm font-semibold text-[var(--color-ink)]">Последние подходы</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11.5px] font-semibold uppercase tracking-wide text-[var(--color-faint)]">
                  <th className="border-b border-[var(--color-border-soft)] py-2.5">Дата</th>
                  <th className="border-b border-[var(--color-border-soft)] py-2.5 text-right">Вес</th>
                  <th className="border-b border-[var(--color-border-soft)] py-2.5 text-right">Повторы</th>
                  <th className="border-b border-[var(--color-border-soft)] py-2.5 text-right">Подходы</th>
                </tr>
              </thead>
              <tbody>
                {recentLogs.map((log) => (
                  <tr key={log.id} className="border-b border-[#f5f5f1]">
                    <td className="py-2.5 font-mono text-[13px]">{log.log_date}</td>
                    <td className="py-2.5 text-right font-mono font-semibold">{log.weight ?? "—"}</td>
                    <td className="py-2.5 text-right font-mono text-[13px] text-[var(--color-muted)]">
                      {log.reps ?? "—"}
                    </td>
                    <td className="py-2.5 text-right font-mono text-[13px] text-[var(--color-muted)]">{log.sets}</td>
                  </tr>
                ))}
                {recentLogs.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-3 text-[var(--color-faint)]">
                      Пока нет записей по этому упражнению.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}
