"use client";

import { Suspense, useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { DateNav } from "@/components/date-nav";
import { MarkdownEditor } from "@/components/markdown-editor";
import { VoiceCapture, type VoiceApply } from "@/components/voice-capture";
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
  // Not edited here — that is the "Состояние" tab — but voice input can fill
  // them, and the review panel needs the current values to know what it would
  // overwrite. Kept in state (not a ref) so the panel re-reads them after a save.
  const [stateFields, setStateFields] = useState({
    mood: null as number | null,
    energy: null as number | null,
    body_condition: null as number | null,
    sleep_bedtime: "",
    sleep_wakeup: "",
  });
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
    try {
      const entry = await api.get<DiaryEntry>(`/api/diary/${targetDate}`);
      setContent(entry.content ?? "");
      setSelectedTags(entry.tags);
      setDayScore(entry.day_score);
      setStateFields({
        mood: entry.mood,
        energy: entry.energy,
        body_condition: entry.body_condition,
        sleep_bedtime: entry.sleep_bedtime ?? "",
        sleep_wakeup: entry.sleep_wakeup ?? "",
      });
      lastSavedRef.current = stateKey(entry.content ?? "", entry.tags);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setContent("");
        setSelectedTags([]);
        setDayScore(null);
        setStateFields({ mood: null, energy: null, body_condition: null, sleep_bedtime: "", sleep_wakeup: "" });
        lastSavedRef.current = stateKey("", []);
      } else {
        setError(err instanceof ApiError ? err.message : "Ошибка загрузки записи");
      }
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

  function stateKey(c: string, t: string[]) {
    return JSON.stringify({ c, t });
  }

  const doSave = useCallback(async (c: string, t: string[]) => {
    const key = stateKey(c, t);
    if (key === lastSavedRef.current) return;
    setSaveStatus("saving");
    try {
      const entry = await api.put<DiaryEntry>("/api/diary", {
        entry_date: date,
        content: c,
        tags: t,
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
      doSave(content, selectedTags);
    }, 1500);
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [content, selectedTags, doSave]);

  async function applyVoice(fields: VoiceApply) {
    if (fields.text !== undefined) setContent(fields.text);
    if (fields.tags !== undefined) setSelectedTags(fields.tags);

    // mood/energy/sleep have no inputs on this page, so there is nothing for
    // autosave to pick up — save them straight away. PUT /api/diary is a
    // partial update, so the text and tags just set above are untouched.
    const stateUpdate = {
      mood: fields.mood,
      energy: fields.energy,
      body_condition: fields.body_condition,
      sleep_bedtime: fields.sleep_bedtime,
      sleep_wakeup: fields.sleep_wakeup,
    };
    const present = Object.fromEntries(
      Object.entries(stateUpdate).filter(([, v]) => v !== undefined)
    );
    if (Object.keys(present).length === 0) return;

    setSaveStatus("saving");
    try {
      const entry = await api.put<DiaryEntry>("/api/diary", { entry_date: date, ...present });
      setStateFields({
        mood: entry.mood,
        energy: entry.energy,
        body_condition: entry.body_condition,
        sleep_bedtime: entry.sleep_bedtime ?? "",
        sleep_wakeup: entry.sleep_wakeup ?? "",
      });
      setSaveStatus("saved");
    } catch (err) {
      setSaveStatus("error");
      setError(err instanceof ApiError ? err.message : "Не удалось сохранить состояние");
    }
  }

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
    await doSave(content, selectedTags);
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
        <VoiceCapture
          current={{ text: content, tags: selectedTags, ...stateFields }}
          onApply={applyVoice}
        />

        <MarkdownEditor
          value={content}
          onChange={setContent}
          placeholder="Что было сегодня важного?"
          rows={10}
        />

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
