"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { register, ApiError } from "@/lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await register(email, name, password, inviteCode);
      router.push("/login");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось зарегистрироваться");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="-m-6 flex min-h-[calc(100vh-57px)] items-center justify-center bg-[var(--color-page)] p-7">
      <div className="card w-full max-w-[360px] p-8">
        <div className="mb-5 flex flex-col items-center gap-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-[11px] bg-[var(--color-accent)] text-lg font-semibold text-white">
            L
          </span>
          <h1 className="text-lg font-semibold tracking-tight">Создать аккаунт</h1>
          <p className="text-center text-xs leading-relaxed text-[var(--color-faint)]">
            Закрытый сервис. Нужен код приглашения от владельца.
          </p>
        </div>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-[#4a4f4a]">Имя</span>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-field w-full"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-[#4a4f4a]">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-field w-full"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-[#4a4f4a]">Пароль</span>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field w-full"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-[#4a4f4a]">Код приглашения</span>
            <input
              type="text"
              required
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              className="input-field w-full font-mono tracking-wide"
            />
          </label>
          {error && <p className="text-sm text-[#b5503e]">{error}</p>}
          <button type="submit" disabled={isSubmitting} className="btn-primary mt-1">
            Создать аккаунт
          </button>
        </form>
        <p className="mt-4 text-center text-[13px] text-[var(--color-faint)]">
          Уже есть аккаунт?{" "}
          <Link href="/login" className="font-medium text-[var(--color-accent)]">
            Войти
          </Link>
        </p>
      </div>
    </div>
  );
}
