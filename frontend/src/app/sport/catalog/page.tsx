"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { API_URL, api, ApiError } from "@/lib/api";
import { ZoomablePhoto } from "@/components/zoomable-photo";
import type { Exercise, ExerciseLog } from "@/lib/types";

const today = () => new Date().toISOString().slice(0, 10);

export default function SportCatalogPage() {
  return (
    <Suspense>
      <SportCatalogContent />
    </Suspense>
  );
}

function SportCatalogContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [date, setDate] = useState(searchParams.get("date") ?? today());

  function changeDate(newDate: string) {
    setDate(newDate);
    router.replace(`/sport/catalog?date=${newDate}`, { scroll: false });
  }

  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [addedIds, setAddedIds] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState("");
  const [muscleGroup, setMuscleGroup] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Exercise[]>("/api/exercises")
      .then(setExercises)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Ошибка загрузки упражнений"));
  }, []);

  useEffect(() => {
    api
      .get<ExerciseLog[]>(`/api/exercise-logs?log_date=${date}`)
      .then((logs) => setAddedIds(new Set(logs.map((l) => l.exercise_id))))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Ошибка загрузки тренировки"));
  }, [date]);

  const muscleGroups = useMemo(
    () => Array.from(new Set(exercises.map((ex) => ex.muscle_group).filter(Boolean))) as string[],
    [exercises]
  );

  const filtered = exercises.filter((ex) => {
    const matchesSearch = ex.name.toLowerCase().includes(search.trim().toLowerCase());
    const matchesGroup = !muscleGroup || ex.muscle_group === muscleGroup;
    return matchesSearch && matchesGroup;
  });

  async function addToDay(exerciseId: number) {
    setError(null);
    try {
      await api.post("/api/exercise-logs", { exercise_id: exerciseId, log_date: date, weight: null, reps: null });
      setAddedIds((prev) => new Set(prev).add(exerciseId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось добавить упражнение");
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-ink)]">Каталог упражнений</h1>
        <input
          type="date"
          value={date}
          onChange={(e) => changeDate(e.target.value)}
          className="input-field w-auto"
        />
      </div>
      <p className="mb-5 max-w-[560px] text-[13px] leading-relaxed text-[var(--color-muted)]">
        Выберите упражнения для тренировки на выбранную дату — заполнить вес и повторы можно на вкладке «Тренировка
        дня».
      </p>

      <div className="mb-4 flex flex-wrap gap-2.5">
        <input
          type="text"
          placeholder="Поиск по названию"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input-field flex-1"
        />
        {muscleGroups.length > 0 && (
          <select
            value={muscleGroup}
            onChange={(e) => setMuscleGroup(e.target.value)}
            className="input-field w-auto"
          >
            <option value="">Все группы мышц</option>
            {muscleGroups.map((group) => (
              <option key={group} value={group}>
                {group}
              </option>
            ))}
          </select>
        )}
      </div>

      {error && <p className="mb-4 text-sm text-[#b5503e]">{error}</p>}

      {exercises.length === 0 && (
        <p className="text-[var(--color-faint)]">
          Упражнений пока нет — попросите администратора добавить их в каталоге.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {filtered.map((ex) => {
          const isAdded = addedIds.has(ex.id);
          return (
            <li key={ex.id} className="card flex items-center gap-3 p-3">
              {ex.photo_url ? (
                <ZoomablePhoto
                  src={`${API_URL}${ex.photo_url}`}
                  alt={ex.name}
                  className="h-[48px] w-[48px] flex-shrink-0 rounded-lg object-cover"
                />
              ) : (
                <div className="flex h-[48px] w-[48px] flex-shrink-0 items-center justify-center rounded-lg bg-[#f2f2ee] text-[10px] text-[var(--color-faint)]">
                  без фото
                </div>
              )}
              <div className="flex-1">
                <p className="font-medium text-[var(--color-ink)]">{ex.name}</p>
                {ex.muscle_group && <p className="text-[11.5px] text-[var(--color-faint)]">{ex.muscle_group}</p>}
              </div>
              <button
                onClick={() => addToDay(ex.id)}
                disabled={isAdded}
                className="btn-secondary whitespace-nowrap py-1.5 text-[12.5px] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isAdded ? "Уже в тренировке" : "Добавить в тренировку"}
              </button>
            </li>
          );
        })}
        {exercises.length > 0 && filtered.length === 0 && (
          <p className="text-[var(--color-faint)]">Ничего не найдено по этому запросу.</p>
        )}
      </ul>
    </div>
  );
}
