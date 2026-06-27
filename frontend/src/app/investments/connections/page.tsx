"use client";

import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api";
import type { InvestmentsSummary } from "@/lib/types";

const EXCHANGES = ["okx", "binance", "bybit", "kucoin", "mexc"];
const BROKERS = ["tbank"];

export default function InvestmentConnectionsPage() {
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [summary, setSummary] = useState<InvestmentsSummary | null>(null);

  async function loadSummary() {
    setSummary(await api.get<InvestmentsSummary>("/api/investments/summary"));
  }

  useEffect(() => {
    loadSummary().catch((err) => setError(err instanceof ApiError ? err.message : "Ошибка загрузки подключений"));
  }, []);

  const [exchange, setExchange] = useState(EXCHANGES[0]);
  const [apiKey, setApiKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [passphrase, setPassphrase] = useState("");

  const [broker, setBroker] = useState(BROKERS[0]);
  const [token, setToken] = useState("");
  const [accountId, setAccountId] = useState("");

  async function connectExchange(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    try {
      await api.post("/api/investments/exchanges", {
        exchange,
        api_key: apiKey,
        secret_key: secretKey,
        passphrase: passphrase || null,
      });
      setApiKey("");
      setSecretKey("");
      setPassphrase("");
      setMessage(`Биржа «${exchange}» подключена`);
      await loadSummary();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось подключить биржу");
    }
  }

  async function disconnectExchange(name: string) {
    if (!window.confirm(`Отключить «${name}»? Ключи будут удалены из хранилища.`)) return;
    setError(null);
    setMessage(null);
    try {
      await api.delete(`/api/investments/exchanges/${name}`);
      setMessage(`Биржа «${name}» отключена`);
      await loadSummary();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось отключить биржу");
    }
  }

  async function connectBroker(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    try {
      await api.post("/api/investments/brokers", { broker, token, account_id: accountId || null });
      setToken("");
      setAccountId("");
      setMessage(`Брокер «${broker}» подключён`);
      await loadSummary();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось подключить брокера");
    }
  }

  async function disconnectBroker(name: string) {
    if (!window.confirm(`Отключить «${name}»? Токен будет удалён из хранилища.`)) return;
    setError(null);
    setMessage(null);
    try {
      await api.delete(`/api/investments/brokers/${name}`);
      setMessage(`Брокер «${name}» отключён`);
      await loadSummary();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось отключить брокера");
    }
  }

  const connectedExchanges = summary?.crypto.map((e) => e.exchange) ?? [];
  const connectedBrokers = summary?.brokers.map((b) => b.broker) ?? [];

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1.5 text-2xl font-semibold tracking-tight text-[var(--color-ink)]">Подключения</h1>
      <p className="mb-5 max-w-[560px] text-[13px] leading-relaxed text-[var(--color-muted)]">
        Ключи и токены уходят напрямую в защищённое хранилище и не сохраняются в базе Life Pilot.
      </p>
      {error && <p className="mb-4 text-sm text-[#b5503e]">{error}</p>}
      {message && <p className="mb-4 text-sm text-[var(--color-accent)]">{message}</p>}

      <section className="metric-card mb-3.5">
        <h2 className="mb-3.5 text-sm font-semibold text-[var(--color-ink)]">Криптобиржа</h2>
        <form onSubmit={connectExchange} autoComplete="off" className="flex flex-col gap-2.5">
          <select value={exchange} onChange={(e) => setExchange(e.target.value)} className="input-field w-auto">
            {EXCHANGES.map((ex) => (
              <option key={ex} value={ex}>
                {ex}
              </option>
            ))}
          </select>
          <input
            type="text"
            name="exchange-api-key"
            placeholder="API key"
            required
            autoComplete="off"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="input-field w-full"
          />
          <input
            type="password"
            name="exchange-secret-key"
            placeholder="Secret key"
            required
            autoComplete="new-password"
            value={secretKey}
            onChange={(e) => setSecretKey(e.target.value)}
            className="input-field w-full"
          />
          <input
            type="password"
            name="exchange-passphrase"
            placeholder="Passphrase (только для OKX)"
            autoComplete="new-password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            className="input-field w-full"
          />
          <button type="submit" className="btn-primary self-start">
            Подключить
          </button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          {connectedExchanges.length === 0 ? (
            <p className="text-[13px] text-[var(--color-faint)]">Биржи пока не подключены.</p>
          ) : (
            connectedExchanges.map((ex) => (
              <button key={ex} onClick={() => disconnectExchange(ex)} className="tag-chip">
                {ex} ×
              </button>
            ))
          )}
        </div>
      </section>

      <section className="metric-card">
        <h2 className="mb-3.5 text-sm font-semibold text-[var(--color-ink)]">Брокер</h2>
        <form onSubmit={connectBroker} autoComplete="off" className="flex flex-col gap-2.5">
          <select value={broker} onChange={(e) => setBroker(e.target.value)} className="input-field w-auto">
            {BROKERS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
          <input
            type="password"
            name="broker-api-token"
            placeholder="API токен"
            required
            autoComplete="new-password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className="input-field w-full"
          />
          <input
            type="text"
            name="broker-account-id"
            placeholder="ID счёта (если несколько)"
            autoComplete="off"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="input-field w-full"
          />
          <button type="submit" className="btn-primary self-start">
            Подключить
          </button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          {connectedBrokers.length === 0 ? (
            <p className="text-[13px] text-[var(--color-faint)]">Брокеры пока не подключены.</p>
          ) : (
            connectedBrokers.map((b) => (
              <button key={b} onClick={() => disconnectBroker(b)} className="tag-chip">
                {b} ×
              </button>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
