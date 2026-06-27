"use client";

import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api";
import type { UserAdmin } from "@/lib/types";

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" });
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserAdmin[]>([]);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  async function loadUsers() {
    setUsers(await api.get<UserAdmin[]>("/api/admin/users"));
  }

  useEffect(() => {
    loadUsers().catch((err) => setError(err instanceof ApiError ? err.message : "Ошибка загрузки пользователей"));
    api
      .get<{ registration_code: string }>("/api/admin/registration-code")
      .then((res) => setCode(res.registration_code))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Ошибка загрузки инвайт-кода"));
  }, []);

  async function toggleAdmin(userId: number, isAdmin: boolean) {
    setError(null);
    try {
      await api.patch(`/api/admin/users/${userId}`, { is_admin: isAdmin });
      await loadUsers();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось обновить пользователя");
    }
  }

  async function saveCode(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSavedMsg(null);
    try {
      await api.put("/api/admin/registration-code", { registration_code: code });
      setSavedMsg("Сохранено");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось сохранить код");
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-5 text-2xl font-semibold tracking-tight text-[var(--color-ink)]">Админка</h1>
      {error && <p className="mb-4 text-sm text-[#b5503e]">{error}</p>}

      <section className="metric-card mb-3.5">
        <h2 className="mb-3.5 text-sm font-semibold text-[var(--color-ink)]">Инвайт-код для регистрации</h2>
        <form onSubmit={saveCode} className="flex max-w-[380px] gap-2.5">
          <input
            type="text"
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="input-field flex-1 font-mono tracking-wide"
          />
          <button type="submit" className="btn-primary whitespace-nowrap">
            Сохранить
          </button>
        </form>
        {savedMsg && <p className="mt-2 text-xs text-[var(--color-accent)]">{savedMsg}</p>}
      </section>

      <section className="metric-card">
        <h2 className="mb-1 text-sm font-semibold text-[var(--color-ink)]">Пользователи</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11.5px] font-semibold uppercase tracking-wide text-[var(--color-faint)]">
              <th className="border-b border-[var(--color-border-soft)] py-2.5">Имя</th>
              <th className="border-b border-[var(--color-border-soft)] py-2.5">Email</th>
              <th className="border-b border-[var(--color-border-soft)] py-2.5">Регистрация</th>
              <th className="border-b border-[var(--color-border-soft)] py-2.5">Последний вход</th>
              <th className="border-b border-[var(--color-border-soft)] py-2.5 text-right">Админ</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-[#f5f5f1]">
                <td className="py-2.5">{u.name}</td>
                <td className="py-2.5 text-[var(--color-muted)]">{u.email}</td>
                <td className="py-2.5 text-[13px] text-[var(--color-faint)]">{formatDate(u.created_at)}</td>
                <td className="py-2.5 text-[13px] text-[var(--color-faint)]">{formatDate(u.last_login_at)}</td>
                <td className="py-2.5 text-right">
                  <button
                    onClick={() => toggleAdmin(u.id, !u.is_admin)}
                    className={u.is_admin ? "btn-secondary py-1 text-[12.5px]" : "btn-text text-[12.5px]"}
                  >
                    {u.is_admin ? "Админ" : "Сделать админом"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
