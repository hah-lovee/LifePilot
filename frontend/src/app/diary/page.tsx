"use client";

import { Suspense, useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { DateNav } from "@/components/date-nav";
import { MarkdownEditor } from "@/components/markdown-editor";
import type { DiaryEntry, DiaryTag } from "@/lib/types";

const today = () => new Date().toISOString().slice(0, 10);

export default function DiaryPage() {
  return (
    <Suspense>
      <DiaryContent />
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

function DiaryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [date, setDate] = useState(searchParams.get("date") ?? today());

  function changeDate(newDate: string) {
    setDate(newDate);
    router.replace(`/diary?date=${newDate}`, { scroll: false });
  }

  const [content, setContent] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [availableTags, setAvailableTags] = useState<DiaryTag[]>([]);
  const [newTagName, setNewTagName] = useState("");
  const [dayScore, setDayScore] = useState<number | null>(null);
  const [sleepBedtime, setSleepBedtime] = useState("");
  const [sleepWakeup, setSleepWakeup] = useState("");
  const [prevBedtime, setPrevBedtime] = useState<string | null>(null); // «Лёг в» предыдущего дня
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  const loadedRef = useRef(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<string>("");

  async function loadTags() {
    setAvailableTags(await api.get<DiaryTag[]>("/api/diary/tags"));
  }

  async function loadEntry(targetDate: string) {
    loadedRef.current = false;
    setSaveStatus("idle");
    setError(null);
    setPrevBedtime(null);
    try {
      const [entry, prevEntry] = await Promise.allSettled([
        api.get<DiaryEntry>(`/api/diary/${targetDate}`),
        api.get<DiaryEntry>(`/api/diary/${prevDateStr(targetDate)}`),
      ]);
      if (entry.status === "fulfilled") {
        const e = entry.value;
        setContent(e.content ?? "");
        setSelectedTags(e.tags);
        setDayScore(e.day_score);
        setSleepBedtime(e.sleep_bedtime ?? "");
        setSleepWakeup(e.sleep_wakeup ?? "");
        lastSavedRef.current = stateKey(e.content ?? "", e.tags, e.sleep_bedtime ?? "", e.sleep_wakeup ?? "");
      } else {
        setContent("");
        setSelectedTags([]);
        setDayScore(null);
        setSleepBedtime("");
        setSleepWakeup("");
        lastSavedRef.current = stateKey("", [], "", "");
      }
      if (prevEntry.status === "fulfilled") {
        setPrevBedtime(prevEntry.value.sleep_bedtime ?? null);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Ошибка загрузки записи");
    } finally {
      loadedRef.current = true;
    }
  }

  useEffect(() => {
    loadTags().catch((err) => setError(err instanceof ApiError ? err.message : "Ошибка загрузки тегов"));
  }, []);

  useEffect(() => {
    loadEntry(date);
  }, [date]);

  function stateKey(c: string, t: string[], bed: string, wake: string) {
    return JSON.stringify({ c, t, bed, wake });
  }

  const doSave = useCallback(async (c: string, t: string[], bed: string, wake: string) => {
    const key = stateKey(c, t, bed, wake);
    if (key === lastSavedRef.current) return;
    setSaveStatus("saving");
    try {
      const entry = await api.put<DiaryEntry>("/api/diary", {
        entry_date: date,
        content: c,
        tags: t,
        sleep_bedtime: bed || null,
        sleep_wakeup: wake || null,
      });
      setDayScore(entry.day_score);
      lastSavedRef.current = key;
      setSaveStatus("saved");
    } catch {
      setSaveStatus("error");
    }
  }, [date]);

  // Debounced autosave — 1.5s after last change
  useEffect(() => {
    if (!loadedRef.current) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      doSave(content, selectedTags, sleepBedtime, sleepWakeup);
    }, 1500);
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [content, selectedTags, sleepBedtime, sleepWakeup, doSave]);

  function toggleTag(name: string) {
    setSelectedTags((prev) => (prev.includes(name) ? prev.filter((t) => t !== name) : [...prev, name]));
  }

  async function addCustomTag(e: FormEvent) {
    e.preventDefault();
    const name = newTagName.trim().toLowerCase();
    if (!name) return;
    setError(null);
    try {
      await api.post<DiaryTag>("/api/diary/tags", { name });
      setNewTagName("");
      await loadTags();
      setSelectedTags((prev) => (prev.includes(name) ? prev : [...prev, name]));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось добавить тег");
    }
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    await doSave(content, selectedTags, sleepBedtime, sleepWakeup);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-ink)]">Запись</h1>
        <DateNav date={date} onChange={changeDate} />
      </div>

      {dayScore !== null && (
        <div className="day-score-badge mb-4">
          <div className="flex items-baseline gap-1">
            <span className="text-[30px] font-semibold leading-none tracking-tight text-[var(--color-accent)]">
              {dayScore.toFixed(1)}
            </span>
            <span className="text-sm text-[#5e7686]">/10</span>
          </div>
          <div className="h-[30px] w-px bg-[#cdd7dd]" />
          <p className="text-xs leading-snug text-[#5e7686]">
            Оценка дня — среднее
            <br />
            оценок привычек
          </p>
        </div>
      )}

      <form onSubmit={onSave} className="flex flex-col gap-4">
        <MarkdownEditor
          value={content}
          onChange={setContent}
          placeholder="Что было сегодня важного?"
          rows={10}
        />

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
            {(() => {
              const h = prevBedtime && sleepWakeup ? calcSleepHours(prevBedtime, sleepWakeup) : null;
              return h !== null ? (
                <div className="pb-4">
                  <SleepBadge hours={h} />
                </div>
              ) : null;
            })()}
          </div>
          {!prevBedtime && sleepWakeup && (
            <p className="mt-2 text-[11px] text-[var(--color-faint)]">
              Заполни «Лёг в» вчера, чтобы увидеть оценку сна
            </p>
          )}
        </div>

        {/* Теги */}
        <div className="card p-4">
          <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-[var(--color-faint)]">
            Теги дня
          </p>
          <div className="flex flex-wrap gap-2">
            {availableTags.map((tag) => {
              const isSelected = selectedTags.includes(tag.name);
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => toggleTag(tag.name)}
                  className={isSelected ? "tag-chip tag-chip-selected" : "tag-chip"}
                >
                  {tag.name}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              type="text"
              placeholder="Свой тег"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              className="input-field min-w-[120px] flex-1 rounded-full py-1.5 text-[13px]"
            />
            <button
              type="button"
              onClick={addCustomTag}
              className="btn-secondary flex-shrink-0 whitespace-nowrap py-1.5 text-[13px]"
            >
              + тег
            </button>
          </div>
        </div>

        {error && <p className="text-sm text-[#b5503e]">{error}</p>}

        <div className="flex items-center gap-3">
          <button type="submit" className="btn-primary self-start">
            Сохранить
          </button>
          <span className="text-[12px] text-[var(--color-faint)]">
            {saveStatus === "saving" && "Сохраняется..."}
            {saveStatus === "saved" && "✓ Сохранено"}
            {saveStatus === "error" && "Ошибка сохранения"}
          </span>
        </div>
      </form>
    </div>
  );
}
