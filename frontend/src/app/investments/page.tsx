"use client";

import { useEffect, useState } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, ApiError } from "@/lib/api";
import type { InvestmentsSummary, NetWorthPoint } from "@/lib/types";

function formatRub(value: number): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(value);
}

export default function InvestmentsPage() {
  const [netWorth, setNetWorth] = useState<NetWorthPoint[]>([]);
  const [summary, setSummary] = useState<InvestmentsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<NetWorthPoint[]>("/api/investments/net-worth"),
      api.get<InvestmentsSummary>("/api/investments/summary"),
    ])
      .then(([nw, s]) => {
        setNetWorth(nw);
        setSummary(s);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Ошибка загрузки портфеля"));
  }, []);

  const latest = netWorth.at(-1) ?? null;
  const chartData = netWorth.map((p) => ({ date: p.snapshot_date.slice(5), total: p.total_value_rub }));
  const hasConnections = summary && (summary.crypto.length > 0 || summary.brokers.length > 0);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-5 text-2xl font-semibold tracking-tight text-[var(--color-ink)]">Портфель</h1>
      {error && <p className="mb-4 text-sm text-[#b5503e]">{error}</p>}

      <div className="mb-3.5 grid grid-cols-3 gap-3.5">
        <Stat label="Капитал сейчас" value={latest?.total_value_rub ?? null} />
        <Stat label="Крипто" value={latest?.crypto_value_rub ?? null} />
        <Stat label="Брокер" value={latest?.broker_value_rub ?? null} />
      </div>

      <section className="metric-card mb-3.5">
        <h2 className="mb-3.5 text-sm font-semibold text-[var(--color-ink)]">Капитал во времени</h2>
        {netWorth.length === 0 ? (
          <p className="text-[var(--color-faint)]">
            Снэпшотов пока нет — первый появится после ночного прогона планировщика (или сразу, если есть
            подключения).
          </p>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <XAxis dataKey="date" fontSize={11} stroke="#9c9c95" tickLine={false} axisLine={{ stroke: "#f0f0ec" }} />
                <YAxis fontSize={11} stroke="#9c9c95" tickLine={false} axisLine={false} width={48} />
                <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e7e7e2", fontSize: 13 }} />
                <Line type="monotone" dataKey="total" stroke="#2d4a5e" strokeWidth={2.5} dot={{ r: 3, fill: "#2d4a5e" }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {!hasConnections && (
        <p className="text-[var(--color-faint)]">
          Биржи и брокеры пока не подключены — сделать это можно на вкладке «Подключения».
        </p>
      )}

      {summary?.crypto.map((exchange) => (
        <section key={exchange.exchange} className="metric-card mb-3.5">
          <h2 className="mb-1 text-sm font-semibold text-[var(--color-ink)] capitalize">{exchange.exchange}</h2>
          {exchange.status !== "ok" ? (
            <p className="text-sm text-[#b5503e]">{exchange.error ?? "Ошибка получения баланса"}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11.5px] font-semibold uppercase tracking-wide text-[var(--color-faint)]">
                  <th className="border-b border-[var(--color-border-soft)] py-2.5">Валюта</th>
                  <th className="border-b border-[var(--color-border-soft)] py-2.5 text-right">Кол-во</th>
                  <th className="border-b border-[var(--color-border-soft)] py-2.5 text-right">USDT</th>
                  <th className="border-b border-[var(--color-border-soft)] py-2.5 text-right">P&L</th>
                </tr>
              </thead>
              <tbody>
                {exchange.balances.map((w) => (
                  <tr key={w.currency} className="border-b border-[#f5f5f1]">
                    <td className="py-2.5 font-medium">{w.currency}</td>
                    <td className="py-2.5 text-right font-mono">{w.total}</td>
                    <td className="py-2.5 text-right font-mono font-semibold">
                      {w.value_usdt?.toFixed(2) ?? "—"}
                    </td>
                    <td
                      className={`py-2.5 text-right font-mono text-[13px] ${
                        w.pnl_usdt !== null && w.pnl_usdt < 0 ? "text-[#b5503e]" : "text-[#3f6b54]"
                      }`}
                    >
                      {w.pnl_usdt !== null ? `${w.pnl_usdt >= 0 ? "+" : ""}${w.pnl_usdt.toFixed(2)}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ))}

      {summary?.brokers.map((broker) => (
        <section key={broker.broker} className="metric-card mb-3.5">
          <h2 className="mb-1 text-sm font-semibold text-[var(--color-ink)] capitalize">
            {broker.broker} · {broker.account_name}
          </h2>
          {broker.status !== "ok" ? (
            <p className="text-sm text-[#b5503e]">{broker.error ?? "Ошибка получения портфеля"}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11.5px] font-semibold uppercase tracking-wide text-[var(--color-faint)]">
                  <th className="border-b border-[var(--color-border-soft)] py-2.5">Тикер</th>
                  <th className="border-b border-[var(--color-border-soft)] py-2.5 text-right">Кол-во</th>
                  <th className="border-b border-[var(--color-border-soft)] py-2.5 text-right">Стоимость</th>
                  <th className="border-b border-[var(--color-border-soft)] py-2.5 text-right">P&L</th>
                </tr>
              </thead>
              <tbody>
                {broker.positions.map((p) => (
                  <tr key={p.ticker} className="border-b border-[#f5f5f1]">
                    <td className="py-2.5 font-medium">{p.name}</td>
                    <td className="py-2.5 text-right font-mono">{p.quantity}</td>
                    <td className="py-2.5 text-right font-mono font-semibold">{formatRub(p.current_value)}</td>
                    <td
                      className={`py-2.5 text-right font-mono text-[13px] ${
                        p.pnl_rub !== null && p.pnl_rub < 0 ? "text-[#b5503e]" : "text-[#3f6b54]"
                      }`}
                    >
                      {p.pnl_rub !== null ? `${p.pnl_rub >= 0 ? "+" : ""}${formatRub(p.pnl_rub)}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ))}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="metric-card">
      <p className="text-[12.5px] text-[var(--color-muted)]">{label}</p>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className="text-[26px] font-semibold leading-none tracking-tight text-[var(--color-ink)]">
          {value !== null ? formatRub(value) : "—"}
        </span>
        <span className="text-[13px] font-normal text-[var(--color-faint)]">₽</span>
      </div>
    </div>
  );
}
