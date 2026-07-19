"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { TelegramLinkOut, TelegramStatusOut, User } from "@/lib/types";

// Россия целиком укладывается в эти зоны (плюс UTC на всякий случай) —
// напоминания сверяются с этим временем, а не с UTC сервера.
const TIMEZONES = [
  { value: "Europe/Kaliningrad", label: "Калининград (UTC+2)" },
  { value: "Europe/Moscow", label: "Москва (UTC+3)" },
  { value: "Europe/Samara", label: "Самара (UTC+4)" },
  { value: "Asia/Yekaterinburg", label: "Екатеринбург (UTC+5)" },
  { value: "Asia/Omsk", label: "Омск (UTC+6)" },
  { value: "Asia/Novosibirsk", label: "Новосибирск (UTC+7)" },
  { value: "Asia/Krasnoyarsk", label: "Красноярск (UTC+7)" },
  { value: "Asia/Irkutsk", label: "Иркутск (UTC+8)" },
  { value: "Asia/Yakutsk", label: "Якутск (UTC+9)" },
  { value: "Asia/Vladivostok", label: "Владивосток (UTC+10)" },
  { value: "Asia/Magadan", label: "Магадан (UTC+11)" },
  { value: "Asia/Kamchatka", label: "Камчатка (UTC+12)" },
  { value: "UTC", label: "UTC" },
];

export default function SettingsPage() {
  const { user } = useAuth();
  const [linked, setLinked] = useState<boolean | null>(null);
  const [linkInfo, setLinkInfo] = useState<TelegramLinkOut | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [tz, setTz] = useState("Europe/Moscow");
  const [tzSaveStatus, setTzSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function loadStatus() {
    const status = await api.get<TelegramStatusOut>("/api/telegram/status");
    setLinked(status.linked);
    if (status.linked) setLinkInfo(null);
  }

  useEffect(() => {
    loadStatus().catch((err) => setError(err instanceof ApiError ? err.message : "Ошибка загрузки статуса"));
  }, []);

  useEffect(() => {
    if (user) setTz(user.timezone);
  }, [user]);

  async function saveTimezone(newTz: string) {
    setTz(newTz);
    setTzSaveStatus("saving");
    try {
      await api.patch<User>("/api/auth/me", { timezone: newTz });
      setTzSaveStatus("saved");
    } catch {
      setTzSaveStatus("error");
    }
  }

  // Пока показан код привязки — тихо проверяем каждые 3с, привязался ли чат,
  // чтобы не заставлять пользователя обновлять страницу руками.
  useEffect(() => {
    if (!linkInfo || linked) return;
    const interval = setInterval(() => {
      loadStatus().catch(() => {});
    }, 3000);
    return () => clearInterval(interval);
  }, [linkInfo, linked]);

  async function startLink() {
    setError(null);
    setBusy(true);
    try {
      const info = await api.post<TelegramLinkOut>("/api/telegram/link");
      setLinkInfo(info);
      setLinked(info.linked);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось получить код привязки");
    } finally {
      setBusy(false);
    }
  }

  async function unlink() {
    if (!window.confirm("Отвязать Telegram? Напоминания перестанут приходить.")) return;
    setError(null);
    setBusy(true);
    try {
      await api.delete("/api/telegram/link");
      setLinked(false);
      setLinkInfo(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось отвязать Telegram");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-5 text-2xl font-semibold tracking-tight text-[var(--color-ink)]">Настройки</h1>
      {error && <p className="mb-4 text-sm text-[#b5503e]">{error}</p>}

      <section className="card mb-4 p-4">
        <h2 className="mb-1 text-sm font-semibold text-[var(--color-ink)]">Часовой пояс</h2>
        <p className="mb-3.5 text-[13px] leading-relaxed text-[var(--color-muted)]">
          Сервер работает по UTC — чтобы время напоминаний по привычкам («в 21:00») совпадало с твоим реальным
          временем, укажи здесь свой часовой пояс.
        </p>
        <div className="flex items-center gap-3">
          <select
            value={tz}
            onChange={(e) => saveTimezone(e.target.value)}
            className="input-field w-auto"
          >
            {TIMEZONES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <span className="text-[12px] text-[var(--color-faint)]">
            {tzSaveStatus === "saving" && "Сохраняется..."}
            {tzSaveStatus === "saved" && "✓ Сохранено"}
            {tzSaveStatus === "error" && "Ошибка сохранения"}
          </span>
        </div>
      </section>

      <section className="card p-4">
        <h2 className="mb-1 text-sm font-semibold text-[var(--color-ink)]">Telegram-уведомления</h2>
        <p className="mb-3.5 text-[13px] leading-relaxed text-[var(--color-muted)]">
          Привяжи Telegram, чтобы получать напоминания по привычкам — расписание настраивается в карточке каждой
          привычки (вкладка «Привычки»).
        </p>

        {linked === null && <p className="text-[13px] text-[var(--color-faint)]">Загрузка…</p>}

        {linked === true && (
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-[#e6eee7] px-3 py-1 text-[12.5px] font-medium text-[#3f6b54]">
              ✓ Подключено
            </span>
            <button onClick={unlink} disabled={busy} className="btn-text text-[13px] disabled:opacity-50">
              Отвязать
            </button>
          </div>
        )}

        {linked === false && !linkInfo && (
          <button onClick={startLink} disabled={busy} className="btn-primary disabled:opacity-50">
            Получить код для привязки
          </button>
        )}

        {linked === false && linkInfo && (
          <div className="flex flex-col gap-2.5">
            {linkInfo.deep_link ? (
              <a href={linkInfo.deep_link} target="_blank" rel="noreferrer" className="btn-primary self-start">
                Открыть в Telegram
              </a>
            ) : (
              <p className="text-[13px] text-[#b5503e]">
                Бот ещё не настроен на сервере (нет TELEGRAM_BOT_USERNAME) — обратись к администратору.
              </p>
            )}
            <p className="text-[12.5px] text-[var(--color-muted)]">
              Или вручную отправь боту команду:
              <br />
              <code className="mt-1 inline-block rounded-md bg-[#f2f2ee] px-2 py-1 font-mono text-[12.5px]">
                /start {linkInfo.link_code}
              </code>
            </p>
            <button onClick={startLink} disabled={busy} className="btn-text self-start text-[12.5px]">
              Обновить код
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
