"use client";

import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api";
import type { InvestmentsSummary } from "@/lib/types";

const EXCHANGES = ["okx", "binance", "bybit", "kucoin", "mexc"];
const BROKERS = ["tbank"];

// type="password" is the single strongest signal browsers use to offer
// autofilling a saved login — Yandex Browser and other Chromium forks keep
// doing it even with autoComplete="new-password". Using type="text" with a
// WebKit-only CSS mask sidesteps that trigger entirely while still hiding
// the value visually (Yandex/Chrome/Edge are all Blink/WebKit-based).
const maskedStyle = { WebkitTextSecurity: "disc" } as unknown as CSSProperties;

function SecretInput({
  name,
  placeholder,
  required,
  value,
  onChange,
}: {
  name: string;
  placeholder: string;
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        type="text"
        name={name}
        placeholder={placeholder}
        required={required}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        data-lpignore="true"
        data-1p-ignore=""
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={visible ? undefined : maskedStyle}
        className="input-field w-full pr-16"
      />
      <button
        type="button"
        onClick={() => setVisible((prev) => !prev)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[12px] text-[var(--color-faint)] hover:text-[var(--color-ink)]"
      >
        {visible ? "Скрыть" : "Показать"}
      </button>
    </div>
  );
}

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-[#f0f0ec] ${className ?? ""}`} />;
}

export default function InvestmentConnectionsPage() {
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [summary, setSummary] = useState<InvestmentsSummary | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadSummary() {
    setSummary(await api.get<InvestmentsSummary>("/api/investments/summary"));
  }

  useEffect(() => {
    loadSummary()
      .catch((err) => setError(err instanceof ApiError ? err.message : "Ошибка загрузки подключений"))
      .finally(() => setLoading(false));
  }, []);

  const [exchange, setExchange] = useState(EXCHANGES[0]);
  const [exchangePortfolioName, setExchangePortfolioName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [passphrase, setPassphrase] = useState("");

  const [broker, setBroker] = useState(BROKERS[0]);
  const [brokerPortfolioName, setBrokerPortfolioName] = useState("");
  const [token, setToken] = useState("");
  const [accountId, setAccountId] = useState("");

  async function connectExchange(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    try {
      await api.post("/api/investments/exchanges", {
        exchange,
        portfolio_name: exchangePortfolioName.trim() || null,
        api_key: apiKey,
        secret_key: secretKey,
        passphrase: passphrase || null,
      });
      setApiKey("");
      setSecretKey("");
      setPassphrase("");
      setExchangePortfolioName("");
      const displayName = exchangePortfolioName.trim() || exchange;
      setMessage(`Биржа «${exchange}» (${displayName}) подключена`);
      await loadSummary();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось подключить биржу");
    }
  }

  async function disconnectExchange(portfolioName: string) {
    if (!window.confirm(`Отключить портфель «${portfolioName}»? Ключи будут удалены из хранилища.`)) return;
    setError(null);
    setMessage(null);
    try {
      await api.delete(`/api/investments/exchanges/${portfolioName}`);
      setMessage(`Портфель «${portfolioName}» отключён`);
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
      await api.post("/api/investments/brokers", {
        broker,
        portfolio_name: brokerPortfolioName.trim() || null,
        token,
        account_id: accountId || null,
      });
      setToken("");
      setAccountId("");
      setBrokerPortfolioName("");
      const displayName = brokerPortfolioName.trim() || broker;
      setMessage(`Брокер «${broker}» (${displayName}) подключён`);
      await loadSummary();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось подключить брокера");
    }
  }

  async function disconnectBroker(portfolioName: string) {
    if (!window.confirm(`Отключить портфель «${portfolioName}»? Токен будет удалён из хранилища.`)) return;
    setError(null);
    setMessage(null);
    try {
      await api.delete(`/api/investments/brokers/${portfolioName}`);
      setMessage(`Портфель «${portfolioName}» отключён`);
      await loadSummary();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось отключить брокера");
    }
  }

  const connectedExchanges = summary?.crypto ?? [];
  const connectedBrokers = summary?.brokers ?? [];

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1.5 text-2xl font-semibold tracking-tight text-[var(--color-ink)]">Подключения</h1>
      <p className="mb-5 max-w-[560px] text-[13px] leading-relaxed text-[var(--color-muted)]">
        Ключи и токены уходят напрямую в защищённое хранилище и не сохраняются в базе Life Pilot.
        Можно подключить до 5 портфелей на каждую биржу или брокера.
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
            name="exchange-portfolio-name"
            placeholder={`Название портфеля (по умолчанию «${exchange}»)`}
            autoComplete="off"
            data-lpignore="true"
            data-1p-ignore=""
            value={exchangePortfolioName}
            onChange={(e) => setExchangePortfolioName(e.target.value)}
            className="input-field w-full"
          />
          <input
            type="text"
            name="exchange-api-key"
            placeholder="API key"
            required
            autoComplete="off"
            data-lpignore="true"
            data-1p-ignore=""
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="input-field w-full"
          />
          <SecretInput name="exchange-secret-key" placeholder="Secret key" required value={secretKey} onChange={setSecretKey} />
          <SecretInput
            name="exchange-passphrase"
            placeholder="Passphrase (только для OKX)"
            value={passphrase}
            onChange={setPassphrase}
          />
          <button type="submit" className="btn-primary self-start">
            Подключить
          </button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          {loading ? (
            <>
              <Skeleton className="h-7 w-24 rounded-full" />
              <Skeleton className="h-7 w-20 rounded-full" />
            </>
          ) : connectedExchanges.length === 0 ? (
            <p className="text-[13px] text-[var(--color-faint)]">Биржи пока не подключены.</p>
          ) : (
            connectedExchanges.map((ex) => {
              const label = ex.portfolio_name && ex.portfolio_name !== ex.exchange
                ? `${ex.exchange} · ${ex.portfolio_name}`
                : ex.portfolio_name || ex.exchange;
              return (
                <button
                  key={ex.portfolio_name || ex.exchange}
                  onClick={() => disconnectExchange(ex.portfolio_name || ex.exchange)}
                  className="tag-chip"
                >
                  {label} ×
                </button>
              );
            })
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
            type="text"
            name="broker-portfolio-name"
            placeholder={`Название портфеля (по умолчанию «${broker}»)`}
            autoComplete="off"
            data-lpignore="true"
            data-1p-ignore=""
            value={brokerPortfolioName}
            onChange={(e) => setBrokerPortfolioName(e.target.value)}
            className="input-field w-full"
          />
          <SecretInput name="broker-api-token" placeholder="API токен" required value={token} onChange={setToken} />
          <input
            type="text"
            name="broker-account-id"
            placeholder="ID счёта (если несколько)"
            autoComplete="off"
            data-lpignore="true"
            data-1p-ignore=""
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="input-field w-full"
          />
          <button type="submit" className="btn-primary self-start">
            Подключить
          </button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          {loading ? (
            <Skeleton className="h-7 w-24 rounded-full" />
          ) : connectedBrokers.length === 0 ? (
            <p className="text-[13px] text-[var(--color-faint)]">Брокеры пока не подключены.</p>
          ) : (
            connectedBrokers.map((b) => {
              const label = b.portfolio_name && b.portfolio_name !== b.broker
                ? `${b.broker} · ${b.portfolio_name}`
                : b.portfolio_name || b.broker;
              return (
                <button
                  key={b.portfolio_name || b.broker}
                  onClick={() => disconnectBroker(b.portfolio_name || b.broker)}
                  className="tag-chip"
                >
                  {label} ×
                </button>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
