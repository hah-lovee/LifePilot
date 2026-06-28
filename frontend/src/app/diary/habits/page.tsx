"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import type { Habit, HabitFrequency, HabitLog } from "@/lib/types";

const today = () => new Date().toISOString().slice(0, 10);

const frequencyLabel: Record<HabitFrequency, string> = {
  daily: "Ежедневно",
  weekly: "Еженедельно",
  monthly: "Ежемесячно",
};

export default function HabitsPage() {
  return (
    <Suspense>
      <HabitsContent />
    </Suspense>
  );
}

function HabitsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [date, setDate] = useState(searchParams.get("date") ?? today());

  function changeDate(newDate: string) {
    setDate(newDate);
    router.replace(`/diary/habits?date=${newDate}`, { scroll: false });
  }
  const [habits, setHabits] = useState<Habit[]>([]);
  const [archivedHabits, setArchivedHabits] = useState<Habit[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [catalogHabits, setCatalogHabits] = useState<Habit[]>([]);
  const [showCatalog, setShowCatalog] = useState(false);
  const [dateLogs, setDateLogs] = useState<Record<number, HabitLog>>({});
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [frequency, setFrequency] = useState<HabitFrequency>("daily");

  async function loadHabits() {
    const all = await api.get<Habit[]>("/api/habits?include_inactive=true");
    const active = all.filter((habit) => habit.is_active);
    setHabits(active);
    setArchivedHabits(all.filter((habit) => !habit.is_active));

    const logEntries = await Promise.all(
      active.map(async (habit) => {
        const logs = await api.get<HabitLog[]>(
          `/api/habits/${habit.id}/logs?date_from=${date}&date_to=${date}`
        );
        return [habit.id, logs[0]] as const;
      })
    );
    setDateLogs(Object.fromEntries(logEntries.filter(([, log]) => log)));
  }

  useEffect(() => {
    loadHabits().catch((err) => setError(err instanceof ApiError ? err.message : "Ошибка загрузки"));
  }, [date]);

  useEffect(() => {
    api
      .get<Habit[]>("/api/habits/catalog")
      .then(setCatalogHabits)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Ошибка загрузки каталога"));
  }, []);

  async function adoptHabit(habitId: number) {
    setError(null);
    try {
      await api.post(`/api/habits/${habitId}/adopt`);
      await loadHabits();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось добавить привычку");
    }
  }

  async function createHabit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/api/habits", { name, frequency });
      setName("");
      await loadHabits();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось создать привычку");
    }
  }

  async function logScore(habitId: number, score: number) {
    setError(null);
    try {
      const log = await api.put<HabitLog>(`/api/habits/${habitId}/logs`, { log_date: date, score });
      setDateLogs((prev) => ({ ...prev, [habitId]: log }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось сохранить оценку");
    }
  }

  async function setActive(habitId: number, isActive: boolean) {
    setError(null);
    try {
      await api.patch(`/api/habits/${habitId}`, { is_active: isActive });
      await loadHabits();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : `Не удалось ${isActive ? "восстановить" : "архивировать"} привычку`
      );
    }
  }

  async function deleteHabit(habitId: number, habitName: string) {
    if (!window.confirm(`Удалить привычку «${habitName}» навсегда? Вся история оценок будет потеряна.`)) {
      return;
    }
    setError(null);
    try {
      await api.delete(`/api/habits/${habitId}`);
      await loadHabits();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось удалить привычку");
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-ink)]">Привычки</h1>
        <input
          type="date"
          value={date}
          onChange={(e) => changeDate(e.target.value)}
          className="input-field w-auto"
        />
      </div>

      <form onSubmit={createHabit} className="card mb-5 flex flex-wrap items-center gap-2.5 p-4">
        <input
          type="text"
          placeholder="Новая привычка — например, «10 000 шагов»"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="input-field flex-1"
        />
        <select
          value={frequency}
          onChange={(e) => setFrequency(e.target.value as HabitFrequency)}
          className="input-field w-auto"
        >
          {Object.entries(frequencyLabel).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button type="submit" className="btn-primary whitespace-nowrap">
          Добавить
        </button>
      </form>

      {error && <p className="mb-4 text-sm text-[#b5503e]">{error}</p>}

      <ul className="flex flex-col gap-2.5">
        {habits.map((habit) => {
          const loggedScore = dateLogs[habit.id]?.score ?? null;
          return (
            <li key={habit.id} className="card p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="font-semibold text-[var(--color-ink)]">{habit.name}</span>
                  <span className="rounded-md bg-[#f2f2ee] px-2 py-0.5 text-[11.5px] text-[var(--color-muted)]">
                    {frequencyLabel[habit.frequency]}
                  </span>
                </div>
                <button onClick={() => setActive(habit.id, false)} className="btn-text">
                  Архивировать
                </button>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <span className="whitespace-nowrap text-xs text-[var(--color-faint)]">Оценка за день</span>
                <div className="flex flex-wrap gap-1.5">
                  {Array.from({ length: 11 }, (_, score) => {
                    const isActive = score === loggedScore;
                    return (
                      <button
                        key={score}
                        onClick={() => logScore(habit.id, score)}
                        className={`h-[31px] w-[31px] rounded-lg font-mono text-[13px] font-medium transition-colors ${
                          isActive
                            ? "border border-[var(--color-accent)] bg-[var(--color-accent)] text-white"
                            : "border border-[var(--color-border)] bg-white text-[var(--color-muted)] hover:border-[var(--color-accent)]"
                        }`}
                      >
                        {score}
                      </button>
                    );
                  })}
                </div>
              </div>
            </li>
          );
        })}
        {habits.length === 0 && (
          <p className="text-[var(--color-faint)]">Пока нет привычек — добавьте первую выше.</p>
        )}
      </ul>

      <button onClick={() => setShowArchived((prev) => !prev)} className="btn-text mt-6 inline-flex items-center gap-1.5">
        <span className="text-[11px]">▾</span>
        {showArchived ? "Скрыть архивные" : `Показать архивные (${archivedHabits.length})`}
      </button>

      {showArchived && (
        <ul className="mt-3 flex flex-col gap-2">
          {archivedHabits.map((habit) => (
            <li
              key={habit.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-[#e0e0db] bg-[#fbfbfa] p-3.5"
            >
              <div className="flex items-center gap-2.5">
                <span className="text-[var(--color-muted)]">{habit.name}</span>
                <span className="rounded-md bg-[#f2f2ee] px-2 py-0.5 text-[11.5px] text-[var(--color-faint)]">
                  {frequencyLabel[habit.frequency]}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={() => setActive(habit.id, true)} className="btn-secondary py-1.5 text-[13px]">
                  Восстановить
                </button>
                <button onClick={() => deleteHabit(habit.id, habit.name)} className="btn-danger rounded-lg px-2.5 py-1.5">
                  Удалить
                </button>
              </div>
            </li>
          ))}
          {archivedHabits.length === 0 && (
            <p className="text-[var(--color-faint)]">Архивных привычек нет.</p>
          )}
        </ul>
      )}

      <button onClick={() => setShowCatalog((prev) => !prev)} className="btn-text mt-3 inline-flex items-center gap-1.5">
        <span className="text-[11px]">▾</span>
        {showCatalog ? "Скрыть каталог" : `Показать каталог (${catalogHabits.length})`}
      </button>

      {showCatalog && (
        <ul className="mt-3 flex flex-col gap-2">
          {catalogHabits.map((habit) => {
            const alreadyAdded = habits.some((h) => h.name === habit.name) || archivedHabits.some((h) => h.name === habit.name);
            return (
              <li
                key={habit.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--color-border)] bg-white p-3.5"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-[var(--color-ink)]">{habit.name}</span>
                  <span className="rounded-md bg-[#f2f2ee] px-2 py-0.5 text-[11.5px] text-[var(--color-faint)]">
                    {frequencyLabel[habit.frequency]}
                  </span>
                </div>
                <button
                  onClick={() => adoptHabit(habit.id)}
                  disabled={alreadyAdded}
                  className="btn-secondary py-1.5 text-[13px] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {alreadyAdded ? "Уже добавлено" : "Добавить себе"}
                </button>
              </li>
            );
          })}
          {catalogHabits.length === 0 && (
            <p className="text-[var(--color-faint)]">В каталоге пока нет привычек.</p>
          )}
        </ul>
      )}
    </div>
  );
}
