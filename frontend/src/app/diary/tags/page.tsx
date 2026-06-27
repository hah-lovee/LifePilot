"use client";

import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api";
import type { DiaryTag } from "@/lib/types";

export default function TagsPage() {
  const [tags, setTags] = useState<DiaryTag[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function loadTags() {
    setTags(await api.get<DiaryTag[]>("/api/diary/tags"));
  }

  useEffect(() => {
    loadTags().catch((err) => setError(err instanceof ApiError ? err.message : "Ошибка загрузки тегов"));
  }, []);

  async function addTag(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/api/diary/tags", { name });
      setName("");
      await loadTags();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось добавить тег");
    }
  }

  async function removeTag(id: number) {
    setError(null);
    try {
      await api.delete(`/api/diary/tags/${id}`);
      await loadTags();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось удалить тег");
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-ink)]">Теги</h1>
      <p className="mt-1.5 max-w-[560px] text-[13px] leading-relaxed text-[var(--color-muted)]">
        Теги дневника — события, которые могут влиять на выполнение привычек. Базовый набор уже добавлен при
        регистрации, новые теги можно завести здесь или прямо при заполнении записи дневника.
      </p>

      <div className="card mt-5 p-[18px]">
        <div className="flex flex-wrap gap-2.5">
          {tags.map((tag) => (
            <span
              key={tag.id}
              className={
                tag.is_base
                  ? "inline-flex items-center gap-2 rounded-full border border-[#e0e0db] bg-white py-1.5 pl-3.5 pr-2 text-[13px] text-[#4a4f4a]"
                  : "inline-flex items-center gap-2 rounded-full border border-[var(--color-accent)] bg-[var(--color-accent-soft)] py-1.5 pl-3.5 pr-2 text-[13px] font-medium text-[var(--color-accent)]"
              }
            >
              {tag.name}
              <button
                onClick={() => removeTag(tag.id)}
                className="flex text-base leading-none text-[#a2a29b] hover:text-[#b5503e]"
              >
                ×
              </button>
            </span>
          ))}
          {tags.length === 0 && <p className="text-[var(--color-faint)]">Тегов пока нет.</p>}
        </div>

        <form onSubmit={addTag} className="mt-4 flex max-w-[380px] gap-2.5 border-t border-[var(--color-border-soft)] pt-4">
          <input
            type="text"
            placeholder="Новый тег"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input-field flex-1 rounded-full py-1.5 text-[13px]"
          />
          <button type="submit" className="btn-primary whitespace-nowrap rounded-full py-1.5 text-[13px]">
            Добавить тег
          </button>
        </form>
      </div>

      {error && <p className="mt-4 text-sm text-[#b5503e]">{error}</p>}

      <div className="mt-3.5 flex items-center gap-[18px] text-xs text-[var(--color-faint)]">
        <span className="flex items-center gap-1.5">
          <span className="h-[11px] w-[11px] rounded-full border border-[#e0e0db] bg-white" />
          базовый
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-[11px] w-[11px] rounded-full border border-[var(--color-accent)] bg-[var(--color-accent-soft)]" />
          свой
        </span>
      </div>
    </div>
  );
}
