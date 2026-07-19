"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { DateNav } from "@/components/date-nav";
import type { DiaryEntry } from "@/lib/types";

const today = () => new Date().toISOString().slice(0, 10);

export default function StatePage() {
  return (
    <Suspense>
      <StateContent />
    </Suspense>
  );
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

function prevDateStr(dateStr: string): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function calcSleepHours(bedtime: string, wakeup: string): number | null {
  const [bh, bm] = bedtime.split(":").map(Number);
  const [wh, wm] = wakeup.split(":").map(Number);
  if ([bh, bm, wh, wm].some(isNaN)) return null;
  const diff = ((wh * 60 + wm) - (bh * 60 + bm) + 24 * 60) % (24 * 60);
  if (diff === 0 || diff > 20 * 60) return null;
  return Math.round(diff / 6) / 10;
}

function SleepBadge({ hours }: { hours: number }) {
  const [label, colors] =
    hours >= 8 ? ["отличный", "bg-[#e6eee7] text-[#3f6b54]"] :
    hours >= 7 ? ["хороший",  "bg-[#edf4f0] text-[#4d7a63]"] :
    hours >= 6 ? ["нормальный","bg-[#f4eddc] text-[#8a6a1a]"] :
                 ["плохой",   "bg-[#f4e2dd] text-[#b5503e]"];
  return (
    <div className="flex items-center gap-2">
      <span className="text-[20px] font-semibold leading-none text-[var(--color-ink)]">{hours.toFixed(1)}ч</span>
      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${colors}`}>{label}</span>
    </div>
  );
}

function StateContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [date, setDate] = useState(searchParams.get("date") ?? today());

  function changeDate(newDate: string) {
    setDate(newDate);
    router.replace(`/diary/state?date=${newDate}`, { scroll: false });
  }

  const [energy, setEnergy] = useState<number | null>(null);
  const [mood, setMood] = useState<number | null>(null);
  const [bodyCondition, setBodyCondition] = useState<number | null>(null);
  const [sleepBedtime, setSleepBedtime] = useState("");
  const [sleepWakeup, setSleepWakeup] = useState("");
  const [prevBedtime, setPrevBedtime] = useState<string | null>(null); // «Лёг в» предыдущего дня
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  const loadedRef = useRef(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<string>("");

  function stateKey(e: number | null, m: number | null, b: number | null, bed: string, wake: string) {
    return JSON.stringify({ e, m, b, bed, wake });
  }

  async function loadEntry(targetDate: string) {
    loadedRef.current = false;
    setSaveStatus("idle");
    setError(null);
    setPrevBedtime(null);
    try {
      const [entryResult, prevResult] = await Promise.allSettled([
        api.get<DiaryEntry>(`/api/diary/${targetDate}`),
        api.get<DiaryEntry>(`/api/diary/${prevDateStr(targetDate)}`),
      ]);
      if (entryResult.status === "fulfilled") {
        const e = entryResult.value;
        setEnergy(e.energy);
        setMood(e.mood);
        setBodyCondition(e.body_condition);
        setSleepBedtime(e.sleep_bedtime ?? "");
        setSleepWakeup(e.sleep_wakeup ?? "");
        lastSavedRef.current = stateKey(e.energy, e.mood, e.body_condition, e.sleep_bedtime ?? "", e.sleep_wakeup ?? "");
      } else {
        setEnergy(null);
        setMood(null);
        setBodyCondition(null);
        setSleepBedtime("");
        setSleepWakeup("");
        lastSavedRef.current = stateKey(null, null, null, "", "");
      }
      if (prevResult.status === "fulfilled") {
        setPrevBedtime(prevResult.value.sleep_bedtime ?? null);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Ошибка загрузки состояния");
    } finally {
      loadedRef.current = true;
    }
  }

  useEffect(() => {
    loadEntry(date);
  }, [date]);

  const doSave = useCallback(
    async (e: number | null, m: number | null, b: number | null, bed: string, wake: string) => {
      const key = stateKey(e, m, b, bed, wake);
      if (key === lastSavedRef.current) return;
      setSaveStatus("saving");
      try {
        await api.put<DiaryEntry>("/api/diary", {
          entry_date: date,
          energy: e,
          mood: m,
          body_condition: b,
          sleep_bedtime: bed || null,
          sleep_wakeup: wake || null,
        });
        lastSavedRef.current = key;
        setSaveStatus("saved");
      } catch {
        setSaveStatus("error");
      }
    },
    [date]
  );

  // Debounced autosave — 600ms после последнего изменения (слайдеры дёргаются чаще текста)
  useEffect(() => {
    if (!loadedRef.current) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      doSave(energy, mood, bodyCondition, sleepBedtime, sleepWakeup);
    }, 600);
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [energy, mood, bodyCondition, sleepBedtime, sleepWakeup, doSave]);

  const sleepHours = prevBedtime && sleepWakeup ? calcSleepHours(prevBedtime, sleepWakeup) : null;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-ink)]">Состояние</h1>
        <DateNav date={date} onChange={changeDate} />
      </div>

      {error && <p className="mb-4 text-sm text-[#b5503e]">{error}</p>}

      <div className="flex flex-col gap-4">
        <div className="card p-4">
          <p className="mb-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--color-faint)]">
            Самооценка дня
          </p>
          <div className="flex flex-col gap-4">
            <StateSlider label="Энергия" value={energy} onChange={setEnergy} />
            <StateSlider label="Настроение" value={mood} onChange={setMood} />
            <StateSlider
              label="Самочувствие"
              hint="болезнь, сильный стресс и т.п. — низкая оценка"
              value={bodyCondition}
              onChange={setBodyCondition}
            />
          </div>
        </div>

        {/* Сон */}
        <div className="card p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-faint)]">Сон</p>
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-[12px] text-[var(--color-muted)]">Встал в</span>
              <input
                type="time"
                value={sleepWakeup}
                onChange={(e) => setSleepWakeup(e.target.value)}
                className="input-field w-[120px] rounded-lg py-1.5 text-[13px]"
              />
              <span className="text-[11px] text-[var(--color-faint)]">утро этого дня</span>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[12px] text-[var(--color-muted)]">Лёг в</span>
              <input
                type="time"
                value={sleepBedtime}
                onChange={(e) => setSleepBedtime(e.target.value)}
                className="input-field w-[120px] rounded-lg py-1.5 text-[13px]"
              />
              <span className="text-[11px] text-[var(--color-faint)]">вечер этого дня</span>
            </label>
            {sleepHours !== null && (
              <div className="pb-4">
                <SleepBadge hours={sleepHours} />
              </div>
            )}
          </div>
          {!prevBedtime && sleepWakeup && (
            <p className="mt-2 text-[11px] text-[var(--color-faint)]">
              Заполни «Лёг в» вчера, чтобы увидеть оценку сна
            </p>
          )}
        </div>

        <span className="text-[12px] text-[var(--color-faint)]">
          {saveStatus === "saving" && "Сохраняется..."}
          {saveStatus === "saved" && "✓ Сохранено"}
          {saveStatus === "error" && "Ошибка сохранения"}
        </span>
      </div>
    </div>
  );
}

function StateSlider({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[13px] font-medium text-[var(--color-ink)]">{label}</span>
        <span className="font-mono text-[13px] text-[var(--color-muted)]">{value ?? "—"}/10</span>
      </div>
      <input
        type="range"
        min={1}
        max={10}
        step={1}
        value={value ?? 5}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--color-accent)]"
      />
      {hint && <p className="mt-0.5 text-[11px] text-[var(--color-faint)]">{hint}</p>}
    </div>
  );
}
