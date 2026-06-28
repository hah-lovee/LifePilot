"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { API_URL, api, ApiError } from "@/lib/api";
import { ZoomablePhoto } from "@/components/zoomable-photo";
import type { Exercise, ExerciseLog } from "@/lib/types";

const today = () => new Date().toISOString().slice(0, 10);

export default function SportPage() {
  return (
    <Suspense>
      <SportContent />
    </Suspense>
  );
}

function SportContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [date, setDate] = useState(searchParams.get("date") ?? today());

  function changeDate(newDate: string) {
    setDate(newDate);
    router.replace(`/sport?date=${newDate}`, { scroll: false });
  }

  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [logs, setLogs] = useState<ExerciseLog[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function loadExercises() {
    setExercises(await api.get<Exercise[]>("/api/exercises"));
  }

  async function loadLogs() {
    setLogs(await api.get<ExerciseLog[]>(`/api/exercise-logs?log_date=${date}`));
  }

  useEffect(() => {
    loadExercises().catch((err) => setError(err instanceof ApiError ? err.message : "Ошибка загрузки упражнений"));
  }, []);

  useEffect(() => {
    loadLogs().catch((err) => setError(err instanceof ApiError ? err.message : "Ошибка загрузки тренировки"));
  }, [date]);

  async function addSet(exerciseId: number) {
    setError(null);
    try {
      await api.post("/api/exercise-logs", { exercise_id: exerciseId, log_date: date, weight: null, reps: null });
      await loadLogs();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось добавить подход");
    }
  }

  async function updateLog(logId: number, weight: number | null, reps: number | null) {
    setError(null);
    try {
      await api.patch(`/api/exercise-logs/${logId}`, { weight, reps });
      await loadLogs();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось изменить подход");
    }
  }

  async function deleteLog(logId: number) {
    setError(null);
    try {
      await api.delete(`/api/exercise-logs/${logId}`);
      await loadLogs();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось удалить подход");
    }
  }

  const exerciseById = new Map(exercises.map((ex) => [ex.id, ex]));
  const logsByExercise = new Map<number, ExerciseLog[]>();
  for (const log of logs) {
    const list = logsByExercise.get(log.exercise_id) ?? [];
    list.push(log);
    logsByExercise.set(log.exercise_id, list);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-ink)]">Тренировка дня</h1>
        <input
          type="date"
          value={date}
          onChange={(e) => changeDate(e.target.value)}
          className="input-field w-auto"
        />
      </div>

      {error && <p className="mb-4 text-sm text-[#b5503e]">{error}</p>}

      {logsByExercise.size === 0 && (
        <p className="text-[var(--color-faint)]">
          На этот день не выбрано ни одного упражнения —{" "}
          <Link href={`/sport/catalog?date=${date}`} className="font-medium text-[var(--color-accent)]">
            выберите их в каталоге
          </Link>
          .
        </p>
      )}

      <ul className="flex flex-col gap-3.5">
        {Array.from(logsByExercise.entries()).map(([exerciseId, exerciseLogs]) => (
          <ExerciseGroup
            key={exerciseId}
            exercise={exerciseById.get(exerciseId)}
            logs={exerciseLogs}
            onAddSet={() => addSet(exerciseId)}
            onUpdateLog={updateLog}
            onDeleteLog={deleteLog}
          />
        ))}
      </ul>
    </div>
  );
}

function ExerciseGroup({
  exercise,
  logs,
  onAddSet,
  onUpdateLog,
  onDeleteLog,
}: {
  exercise: Exercise | undefined;
  logs: ExerciseLog[];
  onAddSet: () => void;
  onUpdateLog: (logId: number, weight: number | null, reps: number | null) => void;
  onDeleteLog: (logId: number) => void;
}) {
  return (
    <li className="card p-4">
      <div className="mb-3 flex items-center gap-3">
        {exercise?.photo_url ? (
          <ZoomablePhoto
            src={`${API_URL}${exercise.photo_url}`}
            alt={exercise.name}
            className="h-[56px] w-[56px] flex-shrink-0 rounded-lg object-cover"
          />
        ) : (
          <div className="flex h-[56px] w-[56px] flex-shrink-0 items-center justify-center rounded-lg bg-[#f2f2ee] text-[10px] text-[var(--color-faint)]">
            без фото
          </div>
        )}
        <div className="min-w-[140px] flex-1">
          <p className="font-semibold text-[var(--color-ink)]">{exercise?.name ?? "Упражнение удалено"}</p>
          {exercise?.muscle_group && (
            <p className="text-[11.5px] text-[var(--color-faint)]">{exercise.muscle_group}</p>
          )}
        </div>
        <button onClick={onAddSet} className="btn-secondary whitespace-nowrap py-1.5 text-[12.5px]">
          + подход
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        {logs.map((log) => (
          <SetRow
            key={log.id}
            log={log}
            onUpdate={(weight, reps) => onUpdateLog(log.id, weight, reps)}
            onDelete={() => onDeleteLog(log.id)}
          />
        ))}
      </div>
    </li>
  );
}

function SetRow({
  log,
  onUpdate,
  onDelete,
}: {
  log: ExerciseLog;
  onUpdate: (weight: number | null, reps: number | null) => void;
  onDelete: () => void;
}) {
  const [isEditing, setIsEditing] = useState(log.weight === null && log.reps === null);
  const [weight, setWeight] = useState(log.weight?.toString() ?? "");
  const [reps, setReps] = useState(log.reps?.toString() ?? "");

  function save(e: FormEvent) {
    e.preventDefault();
    onUpdate(weight ? Number(weight) : null, reps ? Number(reps) : null);
    setIsEditing(false);
  }

  return (
    <div className="flex items-center gap-2 rounded-md bg-[#fbfbfa] px-2.5 py-1.5">
      {isEditing ? (
        <form onSubmit={save} className="flex flex-1 items-center gap-1.5">
          <input
            type="number"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            className="input-field w-[90px]"
            step="0.5"
            min="0"
            placeholder="Вес, кг"
            autoFocus
          />
          <input
            type="number"
            value={reps}
            onChange={(e) => setReps(e.target.value)}
            className="input-field w-[90px]"
            min="0"
            placeholder="Повторы"
          />
          <button type="submit" className="btn-secondary py-1 text-[12.5px]">
            Сохранить
          </button>
        </form>
      ) : (
        <>
          <span className="flex-1 font-mono text-[13px] text-[var(--color-muted)]">
            {log.weight ?? "—"} кг × {log.reps ?? "—"}
          </span>
          <button onClick={() => setIsEditing(true)} className="btn-text text-[12.5px]">
            Изменить
          </button>
        </>
      )}
      <button onClick={onDelete} className="text-[#a2a29b] hover:text-[#b5503e]">
        ×
      </button>
    </div>
  );
}
