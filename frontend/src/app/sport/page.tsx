"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { API_URL, api, ApiError } from "@/lib/api";
import { DateNav } from "@/components/date-nav";
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
  const [exerciseOrder, setExerciseOrder] = useState<number[]>([]);
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

  const exerciseById = new Map(exercises.map((ex) => [ex.id, ex]));
  const logsByExercise = new Map<number, ExerciseLog[]>();
  for (const log of logs) {
    const list = logsByExercise.get(log.exercise_id) ?? [];
    list.push(log);
    logsByExercise.set(log.exercise_id, list);
  }

  // Rebuild exercise order when logs or date change, restoring from localStorage if available.
  useEffect(() => {
    const currentIds = Array.from(logsByExercise.keys());
    let storedOrder: number[] = [];
    try {
      const raw = localStorage.getItem(`sport-order-${date}`);
      if (raw) storedOrder = JSON.parse(raw) as number[];
    } catch { /* ignore */ }
    const filtered = storedOrder.filter((id) => currentIds.includes(id));
    const missing = currentIds.filter((id) => !filtered.includes(id));
    setExerciseOrder([...filtered, ...missing]);
  }, [logs, date]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setExerciseOrder((prev) => {
      const from = prev.indexOf(Number(active.id));
      const to = prev.indexOf(Number(over.id));
      const next = arrayMove(prev, from, to);
      localStorage.setItem(`sport-order-${date}`, JSON.stringify(next));
      return next;
    });
  }

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

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-ink)]">Тренировка дня</h1>
        <DateNav date={date} onChange={changeDate} />
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

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={exerciseOrder} strategy={verticalListSortingStrategy}>
          <ul className="flex flex-col gap-3.5">
            {exerciseOrder.map((exerciseId, index) => {
              const exerciseLogs = logsByExercise.get(exerciseId);
              if (!exerciseLogs) return null;
              return (
                <SortableExerciseItem
                  key={exerciseId}
                  id={exerciseId}
                  index={index + 1}
                  exercise={exerciseById.get(exerciseId)}
                  logs={exerciseLogs}
                  onAddSet={() => addSet(exerciseId)}
                  onUpdateLog={updateLog}
                  onDeleteLog={deleteLog}
                />
              );
            })}
          </ul>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function SortableExerciseItem({
  id,
  index,
  exercise,
  logs,
  onAddSet,
  onUpdateLog,
  onDeleteLog,
}: {
  id: number;
  index: number;
  exercise: Exercise | undefined;
  logs: ExerciseLog[];
  onAddSet: () => void;
  onUpdateLog: (logId: number, weight: number | null, reps: number | null) => void;
  onDeleteLog: (logId: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.45 : 1,
        position: isDragging ? "relative" : undefined,
        zIndex: isDragging ? 10 : undefined,
      }}
    >
      <ExerciseGroup
        exercise={exercise}
        logs={logs}
        index={index}
        dragHandleProps={{ ...attributes, ...listeners }}
        onAddSet={onAddSet}
        onUpdateLog={onUpdateLog}
        onDeleteLog={onDeleteLog}
      />
    </li>
  );
}

function ExerciseGroup({
  exercise,
  logs,
  index,
  dragHandleProps,
  onAddSet,
  onUpdateLog,
  onDeleteLog,
}: {
  exercise: Exercise | undefined;
  logs: ExerciseLog[];
  index: number;
  dragHandleProps?: React.HTMLAttributes<HTMLElement>;
  onAddSet: () => void;
  onUpdateLog: (logId: number, weight: number | null, reps: number | null) => void;
  onDeleteLog: (logId: number) => void;
}) {
  return (
    <div className="card p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          {...dragHandleProps}
          className="flex-shrink-0 cursor-grab touch-none select-none text-lg leading-none text-[var(--color-faint)] hover:text-[var(--color-muted)] active:cursor-grabbing"
          aria-label="Перетащить"
        >
          ⠿
        </button>
        <span className="w-5 flex-shrink-0 font-mono text-sm font-bold text-[var(--color-faint)]">{index}.</span>
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
        <div className="min-w-[120px] flex-1">
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
    </div>
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
    <div className="flex flex-wrap items-center gap-2 rounded-md bg-[#fbfbfa] px-2.5 py-1.5">
      {isEditing ? (
        <form onSubmit={save} className="flex flex-1 flex-wrap items-center gap-1.5">
          <input
            type="number"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            className="input-field w-[88px] min-w-[72px] flex-1"
            step="0.5"
            min="0"
            placeholder="Вес, кг"
            autoFocus
          />
          <input
            type="number"
            value={reps}
            onChange={(e) => setReps(e.target.value)}
            className="input-field w-[88px] min-w-[72px] flex-1"
            min="0"
            placeholder="Повторы"
          />
          <button type="submit" className="btn-secondary flex-shrink-0 py-1 text-[12.5px]">
            Сохранить
          </button>
        </form>
      ) : (
        <>
          <span className="flex-1 font-mono text-[13px] text-[var(--color-muted)]">
            {log.weight ?? "—"} кг × {log.reps ?? "—"}
          </span>
          <button onClick={() => setIsEditing(true)} className="btn-text flex-shrink-0 text-[12.5px]">
            Изменить
          </button>
        </>
      )}
      <button onClick={onDelete} className="flex-shrink-0 text-[#a2a29b] hover:text-[#b5503e]">
        ×
      </button>
    </div>
  );
}
