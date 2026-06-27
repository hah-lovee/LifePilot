"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { API_URL, api, ApiError } from "@/lib/api";
import { ZoomablePhoto } from "@/components/zoomable-photo";
import type { Exercise, Habit, HabitFrequency } from "@/lib/types";

const frequencyLabel: Record<HabitFrequency, string> = {
  daily: "Ежедневно",
  weekly: "Еженедельно",
  monthly: "Ежемесячно",
};

export default function AdminCatalogPage() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [habitName, setHabitName] = useState("");
  const [habitFrequency, setHabitFrequency] = useState<HabitFrequency>("daily");

  const [exerciseName, setExerciseName] = useState("");
  const [muscleGroup, setMuscleGroup] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadCatalog() {
    const [h, e] = await Promise.all([
      api.get<Habit[]>("/api/habits/catalog"),
      api.get<Exercise[]>("/api/exercises/catalog"),
    ]);
    setHabits(h);
    setExercises(e);
  }

  useEffect(() => {
    loadCatalog().catch((err) => setError(err instanceof ApiError ? err.message : "Ошибка загрузки каталога"));
  }, []);

  async function createHabit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/api/admin/habits", { name: habitName, frequency: habitFrequency });
      setHabitName("");
      await loadCatalog();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось создать привычку");
    }
  }

  async function deleteHabit(habitId: number, name: string) {
    if (!window.confirm(`Удалить привычку «${name}» из каталога? У тех, кто уже добавил её себе, она останется.`)) {
      return;
    }
    setError(null);
    try {
      await api.delete(`/api/admin/habits/${habitId}`);
      await loadCatalog();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось удалить привычку");
    }
  }

  function validatePhoto(file: File): string | null {
    const maxBytes = 3 * 1024 * 1024;
    if (file.size > maxBytes) return "Файл больше 3 МБ — сожмите фото перед загрузкой.";
    return null;
  }

  async function createExercise(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const file = fileInputRef.current?.files?.[0];
    if (file) {
      const validationError = validatePhoto(file);
      if (validationError) {
        setError(validationError);
        return;
      }
    }
    try {
      const formData = new FormData();
      formData.append("name", exerciseName);
      if (muscleGroup) formData.append("muscle_group", muscleGroup);
      if (file) formData.append("photo", file);
      await api.upload("/api/admin/exercises", formData);
      setExerciseName("");
      setMuscleGroup("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      await loadCatalog();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось создать упражнение");
    }
  }

  async function deleteExercise(exerciseId: number, name: string) {
    if (!window.confirm(`Удалить упражнение «${name}» из каталога? У тех, кто уже добавил его себе, оно останется.`)) {
      return;
    }
    setError(null);
    try {
      await api.delete(`/api/admin/exercises/${exerciseId}`);
      await loadCatalog();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось удалить упражнение");
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-5 text-2xl font-semibold tracking-tight text-[var(--color-ink)]">Каталог по умолчанию</h1>
      <p className="mb-5 max-w-[600px] text-[13px] leading-relaxed text-[var(--color-muted)]">
        Записи отсюда видны всем пользователям в отдельном списке "Каталог" — каждый сам решает, добавить ли их
        себе.
      </p>
      {error && <p className="mb-4 text-sm text-[#b5503e]">{error}</p>}

      <section className="metric-card mb-3.5">
        <h2 className="mb-3.5 text-sm font-semibold text-[var(--color-ink)]">Привычки каталога</h2>
        <form onSubmit={createHabit} className="mb-4 flex items-center gap-2.5">
          <input
            type="text"
            placeholder="Название привычки"
            required
            value={habitName}
            onChange={(e) => setHabitName(e.target.value)}
            className="input-field flex-1"
          />
          <select
            value={habitFrequency}
            onChange={(e) => setHabitFrequency(e.target.value as HabitFrequency)}
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
        <div className="flex flex-wrap gap-2">
          {habits.map((h) => (
            <span key={h.id} className="tag-chip inline-flex items-center gap-2">
              {h.name} · {frequencyLabel[h.frequency]}
              <button
                onClick={() => deleteHabit(h.id, h.name)}
                className="text-[#a2a29b] hover:text-[#b5503e]"
                title="Удалить из каталога"
              >
                ×
              </button>
            </span>
          ))}
          {habits.length === 0 && <p className="text-[var(--color-faint)]">В каталоге пока нет привычек.</p>}
        </div>
      </section>

      <section className="metric-card">
        <h2 className="mb-1 text-sm font-semibold text-[var(--color-ink)]">Упражнения каталога</h2>
        <p className="mb-3.5 text-[12.5px] text-[var(--color-faint)]">
          Рекомендуемое фото: квадратное, ~800×800 px, JPEG/WebP, до 1 МБ (жёсткое ограничение — 3 МБ). Этого
          достаточно для чёткого отображения и в карточке, и при увеличении.
        </p>
        <form onSubmit={createExercise} className="mb-4 flex flex-wrap items-center gap-2.5">
          <input
            type="text"
            placeholder="Название упражнения"
            required
            value={exerciseName}
            onChange={(e) => setExerciseName(e.target.value)}
            className="input-field flex-1"
          />
          <input
            type="text"
            placeholder="Группа мышц"
            value={muscleGroup}
            onChange={(e) => setMuscleGroup(e.target.value)}
            className="input-field w-[160px]"
          />
          <input ref={fileInputRef} type="file" accept="image/*" className="input-field w-auto" />
          <button type="submit" className="btn-primary whitespace-nowrap">
            Добавить
          </button>
        </form>
        <div className="flex flex-wrap gap-3">
          {exercises.map((ex) => (
            <div key={ex.id} className="card flex w-[160px] flex-col gap-2 p-3">
              {ex.photo_url ? (
                <ZoomablePhoto
                  src={`${API_URL}${ex.photo_url}`}
                  alt={ex.name}
                  className="h-[100px] w-full rounded-lg object-cover"
                />
              ) : (
                <div className="flex h-[100px] w-full items-center justify-center rounded-lg bg-[#f2f2ee] text-[11px] text-[var(--color-faint)]">
                  без фото
                </div>
              )}
              <span className="text-[13px] font-medium text-[var(--color-ink)]">{ex.name}</span>
              {ex.muscle_group && (
                <span className="text-[11.5px] text-[var(--color-faint)]">{ex.muscle_group}</span>
              )}
              <button onClick={() => deleteExercise(ex.id, ex.name)} className="btn-text self-start text-[12.5px]">
                Удалить
              </button>
            </div>
          ))}
          {exercises.length === 0 && <p className="text-[var(--color-faint)]">В каталоге пока нет упражнений.</p>}
        </div>
      </section>
    </div>
  );
}
