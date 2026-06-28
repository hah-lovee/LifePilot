"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { API_URL, api, ApiError } from "@/lib/api";
import { ZoomablePhoto } from "@/components/zoomable-photo";
import type { Exercise, Habit, HabitFrequency, MuscleGroup } from "@/lib/types";

const frequencyLabel: Record<HabitFrequency, string> = {
  daily: "Ежедневно",
  weekly: "Еженедельно",
  monthly: "Ежемесячно",
};

const MAX_PHOTO_BYTES = 3 * 1024 * 1024;

function validatePhoto(file: File): string | null {
  if (file.size > MAX_PHOTO_BYTES) return "Файл больше 3 МБ — сожмите фото перед загрузкой.";
  return null;
}

export default function AdminCatalogPage() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [muscleGroups, setMuscleGroups] = useState<MuscleGroup[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [habitName, setHabitName] = useState("");
  const [habitFrequency, setHabitFrequency] = useState<HabitFrequency>("daily");

  const [newGroupName, setNewGroupName] = useState("");

  const [exerciseName, setExerciseName] = useState("");
  const [muscleGroupId, setMuscleGroupId] = useState<number | "">("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editMuscleGroupId, setEditMuscleGroupId] = useState<number | "">("");

  async function loadCatalog() {
    const [h, e, g] = await Promise.all([
      api.get<Habit[]>("/api/habits/catalog"),
      api.get<Exercise[]>("/api/exercises"),
      api.get<MuscleGroup[]>("/api/admin/muscle-groups"),
    ]);
    setHabits(h);
    setExercises(e);
    setMuscleGroups(g);
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

  async function createMuscleGroup(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/api/admin/muscle-groups", { name: newGroupName });
      setNewGroupName("");
      await loadCatalog();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось добавить группу мышц");
    }
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
      if (muscleGroupId !== "") formData.append("muscle_group_id", String(muscleGroupId));
      if (file) formData.append("photo", file);
      await api.upload("/api/admin/exercises", formData);
      setExerciseName("");
      setMuscleGroupId("");
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

  async function replacePhoto(exerciseId: number, file: File) {
    setError(null);
    const validationError = validatePhoto(file);
    if (validationError) {
      setError(validationError);
      return;
    }
    try {
      const formData = new FormData();
      formData.append("photo", file);
      await api.upload(`/api/admin/exercises/${exerciseId}/photo`, formData, "PATCH");
      await loadCatalog();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось заменить фото");
    }
  }

  function startEdit(ex: Exercise) {
    setEditingId(ex.id);
    setEditName(ex.name);
    setEditMuscleGroupId(muscleGroups.find((g) => g.name === ex.muscle_group)?.id ?? "");
  }

  async function saveEdit(exerciseId: number) {
    setError(null);
    try {
      await api.patch(`/api/admin/exercises/${exerciseId}`, {
        name: editName,
        muscle_group_id: editMuscleGroupId === "" ? null : editMuscleGroupId,
      });
      setEditingId(null);
      await loadCatalog();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось изменить упражнение");
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
        <form onSubmit={createHabit} className="mb-4 flex flex-wrap items-center gap-2.5">
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

      <section className="metric-card mb-3.5">
        <h2 className="mb-3.5 text-sm font-semibold text-[var(--color-ink)]">Группы мышц</h2>
        <form onSubmit={createMuscleGroup} className="mb-3 flex flex-wrap items-center gap-2.5">
          <input
            type="text"
            placeholder="Например, «спина»"
            required
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            className="input-field flex-1"
          />
          <button type="submit" className="btn-secondary whitespace-nowrap">
            Добавить группу
          </button>
        </form>
        <div className="flex flex-wrap gap-2">
          {muscleGroups.map((g) => (
            <span key={g.id} className="tag-chip">
              {g.name}
            </span>
          ))}
          {muscleGroups.length === 0 && <p className="text-[var(--color-faint)]">Группы мышц пока не заведены.</p>}
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
          <select
            value={muscleGroupId}
            onChange={(e) => setMuscleGroupId(e.target.value ? Number(e.target.value) : "")}
            className="input-field w-[160px]"
          >
            <option value="">Без группы</option>
            {muscleGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <input ref={fileInputRef} type="file" accept="image/*" className="input-field w-auto" />
          <button type="submit" className="btn-primary whitespace-nowrap">
            Добавить
          </button>
        </form>
        <div className="flex flex-wrap gap-3">
          {exercises.map((ex) => (
            <div key={ex.id} className="card flex w-[180px] flex-col gap-2 p-3">
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

              {editingId === ex.id ? (
                <div className="flex flex-col gap-1.5">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="input-field w-full py-1 text-[13px]"
                  />
                  <select
                    value={editMuscleGroupId}
                    onChange={(e) => setEditMuscleGroupId(e.target.value ? Number(e.target.value) : "")}
                    className="input-field w-full py-1 text-[13px]"
                  >
                    <option value="">Без группы</option>
                    {muscleGroups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                  <div className="flex gap-1.5">
                    <button onClick={() => saveEdit(ex.id)} className="btn-secondary flex-1 py-1 text-[12.5px]">
                      Сохранить
                    </button>
                    <button onClick={() => setEditingId(null)} className="btn-text text-[12.5px]">
                      Отмена
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <span className="text-[13px] font-medium text-[var(--color-ink)]">{ex.name}</span>
                  {ex.muscle_group && (
                    <span className="text-[11.5px] text-[var(--color-faint)]">{ex.muscle_group}</span>
                  )}
                  <button onClick={() => startEdit(ex)} className="btn-text self-start text-[12.5px]">
                    Изменить
                  </button>
                  <label className="btn-text cursor-pointer self-start text-[12.5px]">
                    Заменить фото
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) replacePhoto(ex.id, file);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <button onClick={() => deleteExercise(ex.id, ex.name)} className="btn-text self-start text-[12.5px]">
                    Удалить
                  </button>
                </>
              )}
            </div>
          ))}
          {exercises.length === 0 && <p className="text-[var(--color-faint)]">В каталоге пока нет упражнений.</p>}
        </div>
      </section>
    </div>
  );
}
