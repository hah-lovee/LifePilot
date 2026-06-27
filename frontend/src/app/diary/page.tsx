"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import type { DiaryEntry, DiaryTag } from "@/lib/types";

const today = () => new Date().toISOString().slice(0, 10);

export default function DiaryPage() {
  return (
    <Suspense>
      <DiaryContent />
    </Suspense>
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
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function loadTags() {
    setAvailableTags(await api.get<DiaryTag[]>("/api/diary/tags"));
  }

  async function loadEntry(targetDate: string) {
    setError(null);
    try {
      const entry = await api.get<DiaryEntry>(`/api/diary/${targetDate}`);
      setContent(entry.content ?? "");
      setSelectedTags(entry.tags);
      setDayScore(entry.day_score);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setContent("");
        setSelectedTags([]);
        setDayScore(null);
      } else {
        setError(err instanceof ApiError ? err.message : "Ошибка загрузки записи");
      }
    }
  }

  useEffect(() => {
    loadTags().catch((err) => setError(err instanceof ApiError ? err.message : "Ошибка загрузки тегов"));
  }, []);

  useEffect(() => {
    loadEntry(date);
  }, [date]);

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
    setIsSaving(true);
    setError(null);
    try {
      const entry = await api.put<DiaryEntry>("/api/diary", { entry_date: date, content, tags: selectedTags });
      setDayScore(entry.day_score);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось сохранить запись");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-ink)]">Запись</h1>
        <input
          type="date"
          value={date}
          onChange={(e) => changeDate(e.target.value)}
          className="input-field w-auto"
        />
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
        <textarea
          placeholder="Что было сегодня важного?"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={10}
          className="input-field w-full leading-relaxed"
        />

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
          <div className="mt-3 flex gap-2">
            <input
              type="text"
              placeholder="Свой тег"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              className="input-field flex-1 rounded-full py-1.5 text-[13px]"
            />
            <button type="button" onClick={addCustomTag} className="btn-secondary py-1.5 text-[13px]">
              + тег
            </button>
          </div>
        </div>

        {error && <p className="text-sm text-[#b5503e]">{error}</p>}
        <div className="flex gap-2.5">
          <button type="submit" disabled={isSaving} className="btn-primary self-start">
            Сохранить
          </button>
        </div>
      </form>
    </div>
  );
}
