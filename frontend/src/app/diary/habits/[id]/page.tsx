"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { DateNav } from "@/components/date-nav";
import type { Habit, HabitFrequency, HabitLog, TelegramStatusOut } from "@/lib/types";

const today = () => new Date().toISOString().slice(0, 10);

const frequencyLabel: Record<HabitFrequency, string> = {
  daily: "Ежедневно",
  weekly: "Еженедельно",
  monthly: "Ежемесячно",
};

const WEEKDAYS = [
  { value: 0, label: "Пн" },
  { value: 1, label: "Вт" },
  { value: 2, label: "Ср" },
  { value: 3, label: "Чт" },
  { value: 4, label: "Пт" },
  { value: 5, label: "Сб" },
  { value: 6, label: "Вс" },
];

export default function HabitDetailPage() {
  return (
    <Suspense>
      <HabitDetailContent />
    </Suspense>
  );
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

function HabitDetailContent() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const habitId = Number(params.id);
  const searchParams = useSearchParams();
  const [date, setDate] = useState(searchParams.get("date") ?? today());

  function changeDate(newDate: string) {
    setDate(newDate);
    router.replace(`/diary/habits/${habitId}?date=${newDate}`, { scroll: false });
  }

  const [habit, setHabit] = useState<Habit | null>(null);
  const [history, setHistory] = useState<HabitLog[]>([]);
  const [score, setScore] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderTime, setReminderTime] = useState("21:00");
  const [reminderWeekdays, setReminderWeekdays] = useState<number[]>([]);
  const [reminderSaveStatus, setReminderSaveStatus] = useState<SaveStatus>("idle");
  const [telegramLinked, setTelegramLinked] = useState<boolean | null>(null);

  const loadedRef = useRef(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<string>("");

  async function loadHabit() {
    const all = await api.get<Habit[]>("/api/habits?include_inactive=true");
    const found = all.find((h) => h.id === habitId) ?? null;
    setHabit(found);
    if (found) {
      setReminderEnabled(found.reminder_enabled);
      setReminderTime(found.reminder_time ?? "21:00");
      setReminderWeekdays(found.reminder_weekdays);
    }
  }

  async function loadLogForDate(targetDate: string) {
    loadedRef.current = false;
    const logs = await api.get<HabitLog[]>(`/api/habits/${habitId}/logs?date_from=${targetDate}&date_to=${targetDate}`);
    const log = logs[0] ?? null;
    setScore(log?.score ?? null);
    setNote(log?.note ?? "");
    lastSavedRef.current = JSON.stringify({ score: log?.score ?? null, note: log?.note ?? "" });
    loadedRef.current = true;
  }

  async function loadHistory() {
    const logs = await api.get<HabitLog[]>(`/api/habits/${habitId}/logs`);
    setHistory([...logs].sort((a, b) => b.log_date.localeCompare(a.log_date)).slice(0, 15));
  }

  useEffect(() => {
    Promise.all([loadHabit(), loadHistory()]).catch((err) =>
      setError(err instanceof ApiError ? err.message : "Ошибка загрузки привычки")
    );
    api
      .get<TelegramStatusOut>("/api/telegram/status")
      .then((s) => setTelegramLinked(s.linked))
      .catch(() => setTelegramLinked(null));
  }, [habitId]);

  useEffect(() => {
    loadLogForDate(date).catch((err) => setError(err instanceof ApiError ? err.message : "Ошибка загрузки записи"));
  }, [date, habitId]);

  const doSave = useCallback(
    async (s: number | null, n: string) => {
      if (s === null) return; // без оценки комментарий сохранить нельзя
      const key = JSON.stringify({ score: s, note: n });
      if (key === lastSavedRef.current) return;
      setSaveStatus("saving");
      try {
        const log = await api.put<HabitLog>(`/api/habits/${habitId}/logs`, {
          log_date: date,
          score: s,
          note: n || null,
        });
        lastSavedRef.current = JSON.stringify({ score: log.score, note: log.note ?? "" });
        setSaveStatus("saved");
        await loadHistory();
      } catch (err) {
        setSaveStatus("error");
        setError(err instanceof ApiError ? err.message : "Не удалось сохранить");
      }
    },
    [habitId, date]
  );

  // Debounced autosave комментария/оценки — 600мс после последнего изменения
  useEffect(() => {
    if (!loadedRef.current) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      doSave(score, note);
    }, 600);
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [score, note, doSave]);

  function toggleWeekday(value: number) {
    setReminderWeekdays((prev) => (prev.includes(value) ? prev.filter((d) => d !== value) : [...prev, value].sort()));
  }

  async function saveReminder() {
    setReminderSaveStatus("saving");
    setError(null);
    try {
      const updated = await api.patch<Habit>(`/api/habits/${habitId}`, {
        reminder_enabled: reminderEnabled,
        reminder_time: reminderTime,
        reminder_weekdays: reminderWeekdays,
      });
      setHabit(updated);
      setReminderSaveStatus("saved");
    } catch (err) {
      setReminderSaveStatus("error");
      setError(err instanceof ApiError ? err.message : "Не удалось сохранить напоминание");
    }
  }

  if (!habit) {
    return (
      <div className="mx-auto max-w-2xl">
        {error && <p className="mb-4 text-sm text-[#b5503e]">{error}</p>}
        <p className="text-[var(--color-faint)]">Загрузка…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href={`/diary/habits?date=${date}`}
            className="mb-1.5 inline-flex items-center gap-1 text-[13px] text-[var(--color-muted)] hover:text-[var(--color-ink)] transition-colors"
          >
            ← Привычки
          </Link>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-ink)]">{habit.name}</h1>
            <span className="rounded-md bg-[#f2f2ee] px-2 py-0.5 text-[11.5px] text-[var(--color-muted)]">
              {frequencyLabel[habit.frequency]}
            </span>
          </div>
        </div>
        <DateNav date={date} onChange={changeDate} />
      </div>

      {error && <p className="mb-4 text-sm text-[#b5503e]">{error}</p>}

      <div className="flex flex-col gap-4">
        <div className="card p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-faint)]">
            Оценка и комментарий за день
          </p>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {Array.from({ length: 11 }, (_, s) => (
              <button
                key={s}
                onClick={() => setScore(s)}
                className={`h-[31px] w-[31px] rounded-lg font-mono text-[13px] font-medium transition-colors ${
                  s === score
                    ? "border border-[var(--color-accent)] bg-[var(--color-accent)] text-white"
                    : "border border-[var(--color-border)] bg-white text-[var(--color-muted)] hover:border-[var(--color-accent)]"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={score === null ? "Сначала поставь оценку — тогда можно добавить комментарий" : "Комментарий к сегодняшнему дню…"}
            disabled={score === null}
            rows={3}
            className="input-field w-full resize-y disabled:cursor-not-allowed disabled:opacity-50"
          />
          <span className="mt-1.5 block text-[12px] text-[var(--color-faint)]">
            {saveStatus === "saving" && "Сохраняется..."}
            {saveStatus === "saved" && "✓ Сохранено"}
            {saveStatus === "error" && "Ошибка сохранения"}
          </span>
        </div>

        <div className="card p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-faint)]">
              Напоминание в Telegram
            </p>
            <label className="flex items-center gap-2 text-[13px] text-[var(--color-muted)]">
              <input
                type="checkbox"
                checked={reminderEnabled}
                onChange={(e) => setReminderEnabled(e.target.checked)}
              />
              Включено
            </label>
          </div>

          {telegramLinked === false && (
            <p className="mb-3 text-[12.5px] text-[#8a6a1a]">
              Telegram ещё не привязан — уведомления не будут приходить, пока не подключишь его в{" "}
              <Link href="/settings" className="font-medium underline">
                Настройках
              </Link>
              .
            </p>
          )}

          <div className="mb-3 flex flex-wrap items-center gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[12px] text-[var(--color-muted)]">Время</span>
              <input
                type="time"
                value={reminderTime}
                onChange={(e) => setReminderTime(e.target.value)}
                className="input-field w-[120px] rounded-lg py-1.5 text-[13px]"
              />
            </label>
            <div className="flex flex-col gap-1">
              <span className="text-[12px] text-[var(--color-muted)]">Дни недели</span>
              <div className="flex flex-wrap gap-1">
                {WEEKDAYS.map((wd) => (
                  <button
                    key={wd.value}
                    type="button"
                    onClick={() => toggleWeekday(wd.value)}
                    className={
                      reminderWeekdays.includes(wd.value)
                        ? "rounded-md bg-[var(--color-accent)] px-2 py-1 text-[12px] font-medium text-white"
                        : "rounded-md border border-[var(--color-border)] px-2 py-1 text-[12px] text-[var(--color-muted)] hover:border-[var(--color-accent)]"
                    }
                  >
                    {wd.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button onClick={saveReminder} className="btn-primary py-1.5 text-[13px]">
              Сохранить
            </button>
            <span className="text-[12px] text-[var(--color-faint)]">
              {reminderSaveStatus === "saving" && "Сохраняется..."}
              {reminderSaveStatus === "saved" && "✓ Сохранено"}
              {reminderSaveStatus === "error" && "Ошибка сохранения"}
            </span>
          </div>
        </div>

        <div className="card p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-faint)]">
            Последние записи
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11.5px] font-semibold uppercase tracking-wide text-[var(--color-faint)]">
                  <th className="border-b border-[var(--color-border-soft)] py-2">Дата</th>
                  <th className="border-b border-[var(--color-border-soft)] py-2 text-right">Оценка</th>
                  <th className="border-b border-[var(--color-border-soft)] py-2">Комментарий</th>
                </tr>
              </thead>
              <tbody>
                {history.map((log) => (
                  <tr key={log.id} className="border-b border-[#f5f5f1]">
                    <td className="py-2 font-mono text-[13px]">{log.log_date}</td>
                    <td className="py-2 text-right font-mono font-semibold">{log.score}</td>
                    <td className="py-2 text-[13px] text-[var(--color-muted)]">{log.note ?? "—"}</td>
                  </tr>
                ))}
                {history.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-3 text-[var(--color-faint)]">
                      Записей пока нет.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
