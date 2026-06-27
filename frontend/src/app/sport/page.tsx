"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { API_URL, api, ApiError } from "@/lib/api";
import { ZoomablePhoto } from "@/components/zoomable-photo";
import type { Exercise, ExerciseLog } from "@/lib/types";

const MAX_PHOTO_BYTES = 3 * 1024 * 1024;

const today = () => new Date().toISOString().slice(0, 10);

export default function SportPage() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [logs, setLogs] = useState<Record<number, ExerciseLog[]>>({});
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [muscleGroup, setMuscleGroup] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadExercises() {
    const list = await api.get<Exercise[]>("/api/exercises");
    setExercises(list);
    const entries = await Promise.all(
      list.map(async (ex) => {
        const exLogs = await api.get<ExerciseLog[]>(`/api/exercises/${ex.id}/logs`);
        return [ex.id, exLogs.slice(-5).reverse()] as const;
      })
    );
    setLogs(Object.fromEntries(entries));
  }

  useEffect(() => {
    loadExercises().catch((err) => setError(err instanceof ApiError ? err.message : "Ошибка загрузки"));
  }, []);

  async function createExercise(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const file = fileInputRef.current?.files?.[0];
    if (file && file.size > MAX_PHOTO_BYTES) {
      setError("Файл больше 3 МБ — сожмите фото перед загрузкой.");
      return;
    }
    try {
      const formData = new FormData();
      formData.append("name", name);
      if (muscleGroup) formData.append("muscle_group", muscleGroup);
      if (file) formData.append("photo", file);
      await api.upload("/api/exercises", formData);
      setName("");
      setMuscleGroup("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      await loadExercises();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось создать упражнение");
    }
  }

  async function deleteExercise(id: number, exName: string) {
    if (!window.confirm(`Удалить упражнение «${exName}» навсегда? Вся история подходов будет потеряна.`)) return;
    setError(null);
    try {
      await api.delete(`/api/exercises/${id}`);
      await loadExercises();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось удалить упражнение");
    }
  }

  async function addLog(exerciseId: number, log_date: string, weight: string, reps: string, sets: string) {
    setError(null);
    try {
      await api.post(`/api/exercises/${exerciseId}/logs`, {
        log_date,
        weight: weight ? Number(weight) : null,
        reps: reps ? Number(reps) : null,
        sets: sets ? Number(sets) : 1,
      });
      await loadExercises();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось записать подход");
    }
  }

  async function deleteLog(exerciseId: number, logId: number) {
    setError(null);
    try {
      await api.delete(`/api/exercises/${exerciseId}/logs/${logId}`);
      await loadExercises();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось удалить запись");
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight text-[var(--color-ink)]">Мои упражнения</h1>
      <p className="mb-4 text-[12.5px] text-[var(--color-faint)]">
        Рекомендуемое фото: квадратное, ~800×800 px, JPEG/WebP, до 1 МБ (жёсткое ограничение — 3 МБ).
      </p>

      <form onSubmit={createExercise} className="card mb-5 flex flex-wrap items-center gap-2.5 p-4">
        <input
          type="text"
          placeholder="Название упражнения — например, «Жим штанги лёжа»"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
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

      {error && <p className="mb-4 text-sm text-[#b5503e]">{error}</p>}

      <ul className="flex flex-col gap-3.5">
        {exercises.map((ex) => (
          <ExerciseCard
            key={ex.id}
            exercise={ex}
            logs={logs[ex.id] ?? []}
            onDelete={() => deleteExercise(ex.id, ex.name)}
            onAddLog={(d, w, r, s) => addLog(ex.id, d, w, r, s)}
            onDeleteLog={(logId) => deleteLog(ex.id, logId)}
          />
        ))}
        {exercises.length === 0 && (
          <p className="text-[var(--color-faint)]">Пока нет упражнений — добавьте первое выше или возьмите из каталога.</p>
        )}
      </ul>
    </div>
  );
}

function ExerciseCard({
  exercise,
  logs,
  onDelete,
  onAddLog,
  onDeleteLog,
}: {
  exercise: Exercise;
  logs: ExerciseLog[];
  onDelete: () => void;
  onAddLog: (date: string, weight: string, reps: string, sets: string) => void;
  onDeleteLog: (logId: number) => void;
}) {
  const [date, setDate] = useState(today());
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [sets, setSets] = useState("1");

  function submit(e: FormEvent) {
    e.preventDefault();
    onAddLog(date, weight, reps, sets);
    setWeight("");
    setReps("");
  }

  return (
    <li className="card flex gap-4 p-4">
      {exercise.photo_url ? (
        <ZoomablePhoto
          src={`${API_URL}${exercise.photo_url}`}
          alt={exercise.name}
          className="h-[84px] w-[84px] flex-shrink-0 rounded-lg object-cover"
        />
      ) : (
        <div className="flex h-[84px] w-[84px] flex-shrink-0 items-center justify-center rounded-lg bg-[#f2f2ee] text-[11px] text-[var(--color-faint)]">
          без фото
        </div>
      )}

      <div className="flex-1">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="font-semibold text-[var(--color-ink)]">{exercise.name}</span>
            {exercise.muscle_group && (
              <span className="rounded-md bg-[#f2f2ee] px-2 py-0.5 text-[11.5px] text-[var(--color-muted)]">
                {exercise.muscle_group}
              </span>
            )}
          </div>
          <button onClick={onDelete} className="btn-text">
            Удалить
          </button>
        </div>

        <form onSubmit={submit} className="mt-3 flex flex-wrap items-center gap-2">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input-field w-auto" />
          <input
            type="number"
            placeholder="Вес, кг"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            className="input-field w-[100px]"
            step="0.5"
            min="0"
          />
          <input
            type="number"
            placeholder="Повторы"
            value={reps}
            onChange={(e) => setReps(e.target.value)}
            className="input-field w-[100px]"
            min="0"
          />
          <input
            type="number"
            placeholder="Подходы"
            value={sets}
            onChange={(e) => setSets(e.target.value)}
            className="input-field w-[100px]"
            min="1"
          />
          <button type="submit" className="btn-secondary whitespace-nowrap py-1.5 text-[13px]">
            Записать
          </button>
        </form>

        {logs.length > 0 && (
          <div className="mt-3 flex flex-col gap-1">
            {logs.map((log) => (
              <div
                key={log.id}
                className="flex items-center justify-between rounded-md bg-[#fbfbfa] px-2.5 py-1.5 text-[12.5px] text-[var(--color-muted)]"
              >
                <span className="font-mono">{log.log_date}</span>
                <span className="font-mono">
                  {log.weight ?? "—"} кг × {log.reps ?? "—"} × {log.sets}
                </span>
                <button onClick={() => onDeleteLog(log.id)} className="text-[#a2a29b] hover:text-[#b5503e]">
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </li>
  );
}
