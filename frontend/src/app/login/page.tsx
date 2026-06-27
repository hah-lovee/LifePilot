"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await login(email, password);
      router.push("/diary");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось войти");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="-m-6 flex min-h-[calc(100vh-57px)] items-center justify-center bg-[var(--color-page)] p-7">
      <div className="card w-full max-w-[340px] p-8">
        <div className="mb-6 flex flex-col items-center gap-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-[11px] bg-[var(--color-accent)] text-lg font-semibold text-white">
            L
          </span>
          <h1 className="text-lg font-semibold tracking-tight">Life Pilot</h1>
          <p className="text-[13px] text-[var(--color-faint)]">С возвращением</p>
        </div>
        <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
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
          {error && <p className="text-sm text-[#b5503e]">{error}</p>}
          <button type="submit" disabled={isSubmitting} className="btn-primary mt-1.5">
            Войти
          </button>
        </form>
        <p className="mt-4 text-center text-[13px] text-[var(--color-faint)]">
          Нет аккаунта?{" "}
          <Link href="/register" className="font-medium text-[var(--color-accent)]">
            Регистрация
          </Link>
        </p>
      </div>
    </div>
  );
}
