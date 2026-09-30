"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { API_URL, api, ApiError } from "@/lib/api";
import { ZoomablePhoto } from "@/components/zoomable-photo";
import type { Exercise, ExerciseLog } from "@/lib/types";

export default function ExerciseDetailPage() {
  return (
    <Suspense>
      <ExerciseDetailContent />
    </Suspense>
  );
}

type WorkoutDay = { date: string; sets: ExerciseLog[]; maxWeight: number | null; volume: number };

function ExerciseDetailContent() {
  const params = useParams<{ id: string }>();
  const exerciseId = Number(params.id);
  const searchParams = useSearchParams();
  const backDate = searchParams.get("date");

  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [logs, setLogs] = useState<ExerciseLog[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!Number.isFinite(exerciseId)) return;
    Promise.all([
      api.get<Exercise>(`/api/exercises/${exerciseId}`),
      api.get<ExerciseLog[]>(`/api/exercise-logs?exercise_id=${exerciseId}`),
    ])
      .then(([ex, list]) => {
        setExercise(ex);
        setLogs(list);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Ошибка загрузки упражнения"));
  }, [exerciseId]);

  // Sets grouped into workouts, newest first. The chart and the history below
  // both read from this, so the two can never drift apart.
  const days = useMemo<WorkoutDay[]>(() => {
    const byDate = new Map<string, ExerciseLog[]>();
    for (const log of logs) {
      const list = byDate.get(log.log_date) ?? [];
      list.push(log);
      byDate.set(log.log_date, list);
    }
    return Array.from(byDate.entries())
      .map(([date, sets]) => {
        const weights = sets.map((s) => s.weight).filter((w): w is number => w !== null);
        return {
          date,
          sets,
          maxWeight: weights.length > 0 ? Math.max(...weights) : null,
          volume: sets.reduce((sum, s) => sum + (s.weight ?? 0) * (s.reps ?? 0), 0),
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [logs]);

  const chartData = [...days]
    .reverse()
    .filter((d) => d.maxWeight !== null)
    .map((d) => ({ date: d.date.slice(5), weight: d.maxWeight }));

  // The heaviest set ever: most weight, and on a tie the one with more reps.
  const bestSet = useMemo(() => {
    let best: ExerciseLog | null = null;
    for (const log of logs) {
      if (log.weight === null) continue;
      if (
        best === null ||
        log.weight > (best.weight ?? 0) ||
        (log.weight === best.weight && (log.reps ?? 0) > (best.reps ?? 0))
      ) {
        best = log;
      }
    }
    return best;
  }, [logs]);

  const totalVolume = days.reduce((sum, d) => sum + d.volume, 0);
  const lastDone = days[0]?.date ?? null;
  const daysSince = lastDone ? daysBetween(lastDone, todayIso()) : null;
  // Epley: one-rep maximum ≈ weight × (1 + reps / 30). An estimate derived from
  // a working set — not a number to walk up and try to lift.
  const oneRepMax =
    bestSet && bestSet.weight !== null && bestSet.reps
      ? bestSet.weight * (1 + bestSet.reps / 30)
      : null;

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href={backDate ? `/sport?date=${backDate}` : "/sport"}
        className="mb-4 inline-block text-[13px] font-medium text-[var(--color-accent)]"
      >
        ← К тренировке
      </Link>

      {error && <p className="mb-4 text-sm text-[#b5503e]">{error}</p>}

      {exercise && (
        <div className="mb-4 flex flex-wrap items-start gap-3.5">
          {exercise.photo_url ? (
            <ZoomablePhoto
              src={`${API_URL}${exercise.photo_url}`}
              alt={exercise.name}
              className="h-[84px] w-[84px] flex-shrink-0 rounded-xl object-cover"
            />
          ) : (
            <div className="flex h-[84px] w-[84px] flex-shrink-0 items-center justify-center rounded-xl bg-[#f2f2ee] text-[10px] text-[var(--color-faint)]">
              без фото
            </div>
          )}
          <div className="min-w-[180px] flex-1">
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-ink)]">{exercise.name}</h1>
            {exercise.muscle_group && (
              <p className="text-[13px] text-[var(--color-faint)]">{exercise.muscle_group}</p>
            )}
            {exercise.description && (
              <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--color-muted)]">
                {exercise.description}
              </p>
            )}
          </div>
        </div>
      )}

      {logs.length === 0 ? (
        <p className="text-[var(--color-faint)]">
          Это упражнение вы ещё не делали — добавьте его в тренировку из каталога.
        </p>
      ) : (
        <>
          <div className="mb-3.5 grid grid-cols-2 gap-3.5 sm:grid-cols-4">
            <Stat
              label="Рекорд"
              value={bestSet && bestSet.weight !== null ? `${trim(bestSet.weight)} кг` : "—"}
              hint={
                bestSet
                  ? bestSet.reps
                    ? `× ${bestSet.reps} · ${bestSet.log_date.slice(5)}`
                    : bestSet.log_date.slice(5)
                  : undefined
              }
            />
            <Stat
              label="Оценка 1ПМ"
              value={oneRepMax ? `${trim(Math.round(oneRepMax))} кг` : "—"}
              hint="разовый максимум"
            />
            <Stat label="Тренировок" value={String(days.length)} hint={`подходов: ${logs.length}`} />
            <Stat
              label="Последний раз"
              value={lastDone ? lastDone.slice(5) : "—"}
              hint={daysSince === null ? undefined : daysSince === 0 ? "сегодня" : `${daysSince} дн. назад`}
            />
          </div>

          {chartData.length > 0 && (
            <section className="metric-card mb-3.5">
              <h2 className="mb-3.5 text-sm font-semibold text-[var(--color-ink)]">
                Максимальный вес по датам
              </h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <XAxis
                      dataKey="date"
                      fontSize={11}
                      stroke="#9c9c95"
                      tickLine={false}
                      axisLine={{ stroke: "#f0f0ec" }}
                    />
                    <YAxis fontSize={11} stroke="#9c9c95" tickLine={false} axisLine={false} width={36} />
                    <Tooltip
                      contentStyle={{ borderRadius: 10, border: "1px solid #e7e7e2", fontSize: 13 }}
                      formatter={(value) => [`${value} кг`, "Макс. вес"]}
                    />
                    <Line
                      type="monotone"
                      dataKey="weight"
                      stroke="#2d4a5e"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: "#2d4a5e" }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              {totalVolume > 0 && (
                <p className="mt-2 text-[12px] text-[var(--color-faint)]">
                  Суммарный тоннаж за всю историю: {trim(Math.round(totalVolume))} кг
                </p>
              )}
            </section>
          )}

          <section className="metric-card">
            <h2 className="mb-3.5 text-sm font-semibold text-[var(--color-ink)]">История</h2>
            <ul className="flex flex-col gap-2.5">
              {days.map((day) => (
                <li key={day.date} className="rounded-lg bg-[#fbfbfa] px-3 py-2.5">
                  <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
                    <Link
                      href={`/sport?date=${day.date}`}
                      className="font-mono text-[13px] font-semibold text-[var(--color-accent)]"
                    >
                      {day.date}
                    </Link>
                    <span className="text-[12px] text-[var(--color-faint)]">
                      {day.sets.length} подх.
                      {day.volume > 0 && ` · тоннаж ${trim(Math.round(day.volume))} кг`}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {day.sets.map((set) => (
                      <span
                        key={set.id}
                        className={
                          set.weight !== null && set.weight === day.maxWeight
                            ? "rounded-md bg-[#e8eef2] px-2 py-1 font-mono text-[12.5px] font-semibold text-[var(--color-ink)]"
                            : "rounded-md bg-white px-2 py-1 font-mono text-[12.5px] text-[var(--color-muted)]"
                        }
                      >
                        {trim(set.weight)} кг × {set.reps ?? "—"}
                      </span>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
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

function trim(value: number | null): string {
  if (value === null) return "—";
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(1)));
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}
