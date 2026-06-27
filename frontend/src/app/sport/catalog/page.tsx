"use client";

import { useEffect, useState } from "react";
import { API_URL, api, ApiError } from "@/lib/api";
import { ZoomablePhoto } from "@/components/zoomable-photo";
import type { Exercise } from "@/lib/types";

export default function SportCatalogPage() {
  const [catalog, setCatalog] = useState<Exercise[]>([]);
  const [mine, setMine] = useState<Exercise[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [addedMsg, setAddedMsg] = useState<string | null>(null);

  async function load() {
    const [c, m] = await Promise.all([
      api.get<Exercise[]>("/api/exercises/catalog"),
      api.get<Exercise[]>("/api/exercises"),
    ]);
    setCatalog(c);
    setMine(m);
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof ApiError ? err.message : "Ошибка загрузки каталога"));
  }, []);

  async function adopt(ex: Exercise) {
    setError(null);
    setAddedMsg(null);
    try {
      await api.post(`/api/exercises/${ex.id}/adopt`);
      setAddedMsg(`«${ex.name}» добавлено в «Мои упражнения»`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось добавить упражнение");
    }
  }

  const myNames = new Set(mine.map((m) => m.name));

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1.5 text-2xl font-semibold tracking-tight text-[var(--color-ink)]">Каталог упражнений</h1>
      <p className="mb-5 max-w-[560px] text-[13px] leading-relaxed text-[var(--color-muted)]">
        Общий список, заведённый администратором. Добавьте нужные себе в «Мои упражнения» — это не происходит
        автоматически.
      </p>
      {error && <p className="mb-4 text-sm text-[#b5503e]">{error}</p>}
      {addedMsg && <p className="mb-4 text-sm text-[var(--color-accent)]">{addedMsg}</p>}

      <div className="flex flex-wrap gap-3.5">
        {catalog.map((ex) => (
          <div key={ex.id} className="card flex w-[180px] flex-col gap-2.5 p-3.5">
            {ex.photo_url ? (
              <ZoomablePhoto
                src={`${API_URL}${ex.photo_url}`}
                alt={ex.name}
                className="h-[110px] w-full rounded-lg object-cover"
              />
            ) : (
              <div className="flex h-[110px] w-full items-center justify-center rounded-lg bg-[#f2f2ee] text-[11px] text-[var(--color-faint)]">
                без фото
              </div>
            )}
            <div>
              <p className="text-[13px] font-medium text-[var(--color-ink)]">{ex.name}</p>
              {ex.muscle_group && <p className="text-[11.5px] text-[var(--color-faint)]">{ex.muscle_group}</p>}
            </div>
            <button
              onClick={() => adopt(ex)}
              disabled={myNames.has(ex.name)}
              className="btn-secondary whitespace-nowrap py-1.5 text-[12.5px] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {myNames.has(ex.name) ? "Уже добавлено" : "Добавить себе"}
            </button>
          </div>
        ))}
        {catalog.length === 0 && <p className="text-[var(--color-faint)]">В каталоге пока нет упражнений.</p>}
      </div>
    </div>
  );
}
