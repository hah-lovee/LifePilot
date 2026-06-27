"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import type { DayScorePoint } from "@/lib/types";

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];

const MONTH_NAMES = Array.from({ length: 12 }, (_, i) =>
  new Date(2026, i, 1).toLocaleDateString("ru-RU", { month: "long" })
);

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

function toIsoDate(year: number, month: number, day: number): string {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

function scoreClass(score: number | null): string {
  if (score === null) return "score-pill-none";
  if (score >= 7.5) return "score-pill-high";
  if (score >= 5) return "score-pill-mid";
  return "score-pill-low";
}

export function CalendarView({ returnTo }: { returnTo: "/diary" | "/sport" }) {
  const router = useRouter();
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-indexed
  const [scoresByDate, setScoresByDate] = useState<Record<string, number | null>>({});
  const [workoutDays, setWorkoutDays] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const daysInMonth = useMemo(() => new Date(year, month + 1, 0).getDate(), [year, month]);
  const firstWeekday = useMemo(() => {
    const jsWeekday = new Date(year, month, 1).getDay(); // 0=Sunday
    return (jsWeekday + 6) % 7; // convert to 0=Monday
  }, [year, month]);

  useEffect(() => {
    const dateFrom = toIsoDate(year, month, 1);
    const dateTo = toIsoDate(year, month, daysInMonth);
    Promise.all([
      api.get<DayScorePoint[]>(`/api/reports/day-scores?date_from=${dateFrom}&date_to=${dateTo}`),
      api.get<string[]>(`/api/exercise-logs/days?date_from=${dateFrom}&date_to=${dateTo}`),
    ])
      .then(([points, workoutDates]) => {
        setScoresByDate(Object.fromEntries(points.map((p) => [p.entry_date, p.day_score])));
        setWorkoutDays(new Set(workoutDates));
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Ошибка загрузки календаря"));
  }, [year, month, daysInMonth]);

  function changeMonth(delta: number) {
    const next = new Date(year, month + delta, 1);
    setYear(next.getFullYear());
    setMonth(next.getMonth());
  }

  function goToToday() {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
  }

  const minYear = Math.min(year, today.getFullYear() - 6);
  const maxYear = Math.max(year, today.getFullYear() + 1);
  const yearOptions = Array.from({ length: maxYear - minYear + 1 }, (_, i) => minYear + i);

  function goToDate(isoDate: string) {
    router.push(`${returnTo}?date=${isoDate}`);
  }

  const cells: { day: number | null; isoDate: string | null }[] = [
    ...Array.from({ length: firstWeekday }, () => ({ day: null, isoDate: null })),
    ...Array.from({ length: daysInMonth }, (_, i) => ({
      day: i + 1,
      isoDate: toIsoDate(year, month, i + 1),
    })),
  ];

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-ink)]">Календарь</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => changeMonth(-1)}
            className="flex h-[34px] w-[34px] items-center justify-center rounded-[9px] border border-[#e0e0db] bg-white text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
          >
            ←
          </button>
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="input-field w-auto py-2 font-medium"
          >
            {MONTH_NAMES.map((name, i) => (
              <option key={name} value={i}>
                {name}
              </option>
            ))}
          </select>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="input-field w-auto py-2 font-medium"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <button
            onClick={() => changeMonth(1)}
            className="flex h-[34px] w-[34px] items-center justify-center rounded-[9px] border border-[#e0e0db] bg-white text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
          >
            →
          </button>
          <button onClick={goToToday} className="btn-secondary py-2 text-[13px]">
            Сегодня
          </button>
        </div>
      </div>

      {error && <p className="mb-4 text-sm text-[#b5503e]">{error}</p>}

      <div className="card p-4">
        <div className="mb-2 grid grid-cols-7 gap-2 text-center text-xs font-semibold text-[var(--color-faint)]">
          {WEEKDAYS.map((day) => (
            <div key={day}>{day}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-2">
          {cells.map((cell, i) => {
            if (cell.day === null || cell.isoDate === null) return <div key={`empty-${i}`} />;
            const score = scoresByDate[cell.isoDate] ?? null;
            const hasWorkout = workoutDays.has(cell.isoDate);
            const isToday = cell.isoDate === todayIso;
            return (
              <button
                key={cell.isoDate}
                onClick={() => goToDate(cell.isoDate as string)}
                className={`score-pill ${scoreClass(score)} relative flex aspect-[1/0.84] flex-col justify-between p-2.5 transition-shadow hover:shadow-md ${
                  isToday ? "ring-2 ring-[var(--color-accent)]" : ""
                }`}
              >
                {hasWorkout && (
                  <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-[var(--color-accent)]" />
                )}
                <span className="text-[13px]">{cell.day}</span>
                <span className="self-end font-mono text-[13px]">{score !== null ? score.toFixed(1) : "—"}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-5 text-xs text-[var(--color-muted)]">
        <span className="flex items-center gap-1.5">
          <span className="h-3.5 w-3.5 rounded border border-[#c9dccd] bg-[#e6eee7]" />
          8–10 · высокая
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3.5 w-3.5 rounded border border-[#e4d6b6] bg-[#f4eddc]" />
          5–7 · средняя
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3.5 w-3.5 rounded border border-[#e6c7bd] bg-[#f4e2dd]" />
          &lt;5 · низкая
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3.5 w-3.5 rounded border border-[#e0e0db] bg-[#efefec]" />
          нет данных
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[var(--color-accent)]" />
          была тренировка
        </span>
        <span className="ml-auto text-[var(--color-faint)]">Клик по дню — открыть {returnTo === "/sport" ? "тренировку" : "запись"}</span>
      </div>
    </div>
  );
}
