"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, ApiError, getCachedData, setCachedData } from "@/lib/api";
import type { InvestmentsSummary, NetWorthPoint } from "@/lib/types";

const SUMMARY_CACHE_KEY = "investments_summary";
const CACHE_TTL = 10 * 60 * 1000; // 10 мин

function formatRub(value: number): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(value);
}

function formatPct(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

// Newton-Raphson XIRR — принимает массив {date, amount} (вложения < 0, финальная стоимость > 0)
function calcXIRR(cashflows: { date: Date; amount: number }[]): number | null {
  if (cashflows.length < 2) return null;
  const days0 = cashflows[0].date.getTime();
  const t = cashflows.map((cf) => (cf.date.getTime() - days0) / (365.25 * 86400000));
  const npv = (r: number) => cashflows.reduce((s, cf, i) => s + cf.amount / Math.pow(1 + r, t[i]), 0);
  const dnpv = (r: number) =>
    cashflows.reduce((s, cf, i) => s - (t[i] * cf.amount) / Math.pow(1 + r, t[i] + 1), 0);
  let r = 0.1;
  for (let i = 0; i < 100; i++) {
    const d = dnpv(r);
    if (Math.abs(d) < 1e-12) break;
    const rn = r - npv(r) / d;
    if (Math.abs(rn - r) < 1e-8) return Math.round(rn * 10000) / 100;
    r = rn;
    if (r < -0.999) return null;
  }
  return Math.round(r * 10000) / 100;
}

function computeXIRR(history: NetWorthPoint[]): number | null {
  if (history.length < 2) return null;
  const cashflows: { date: Date; amount: number }[] = [];
  let prevInvested = 0;
  for (const pt of history) {
    const invested = pt.invested_amount_rub ?? 0;
    const delta = invested - prevInvested;
    if (Math.abs(delta) > 1) {
      cashflows.push({ date: new Date(pt.snapshot_date), amount: -delta });
    }
    prevInvested = invested;
  }
  const last = history[history.length - 1];
  cashflows.push({ date: new Date(last.snapshot_date), amount: last.total_value_rub });
  return calcXIRR(cashflows);
}

const PERIODS = [
  { label: "1М", days: 30 },
  { label: "3М", days: 90 },
  { label: "6М", days: 180 },
  { label: "1Г", days: 365 },
  { label: "Всё", days: 0 },
] as const;

export default function InvestmentsPage() {
  const router = useRouter();
  const [netWorth, setNetWorth] = useState<NetWorthPoint[]>([]);
  const [summary, setSummary] = useState<InvestmentsSummary | null>(
    () => getCachedData<InvestmentsSummary>(SUMMARY_CACHE_KEY, CACHE_TTL)
  );
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<(typeof PERIODS)[number]["label"]>("Всё");

  useEffect(() => {
    Promise.all([
      api.get<NetWorthPoint[]>("/api/investments/net-worth"),
      api.get<InvestmentsSummary>("/api/investments/summary"),
    ])
      .then(([nw, s]) => {
        setNetWorth(nw);
        setSummary(s);
        setCachedData(SUMMARY_CACHE_KEY, s);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Ошибка загрузки портфеля"));
  }, []);

  const days = PERIODS.find((p) => p.label === period)?.days ?? 0;
  const cutoff = days > 0 ? new Date(Date.now() - days * 86400000).toISOString().slice(0, 10) : "";
  const filteredHistory = cutoff ? netWorth.filter((p) => p.snapshot_date >= cutoff) : netWorth;

  // Живые цифры из summary (актуальны на момент последнего запроса)
  const usdRub = summary?.usd_rub ?? 0;
  const liveCryptoRub = summary
    ? summary.crypto.reduce(
        (sum, ex) => sum + ex.balances.reduce((s, b) => s + (b.value_usdt ?? 0), 0),
        0
      ) * usdRub
    : null;
  const liveBrokerRub = summary
    ? summary.brokers.reduce((sum, b) => sum + b.total_value, 0)
    : null;
  const liveTotalRub =
    liveCryptoRub !== null && liveBrokerRub !== null ? liveCryptoRub + liveBrokerRub : null;

  // Для P&L и XIRR используем снэпшоты (нужна история вложений)
  const latest = netWorth.at(-1) ?? null;
  const latestInvested = latest?.invested_amount_rub ?? null;
  const pnl =
    liveTotalRub !== null && latestInvested !== null
      ? liveTotalRub + (latest?.dividends_received_rub ?? 0) - latestInvested
      : null;
  const pnlPct = pnl !== null && latestInvested ? (pnl / latestInvested) * 100 : null;
  const xirr = computeXIRR(netWorth);

  const chartData = filteredHistory.map((p) => ({
    date: p.snapshot_date.slice(5),
    total: Math.round(p.total_value_rub),
    invested: p.invested_amount_rub !== null ? Math.round(p.invested_amount_rub) : undefined,
  }));

  const hasConnections = summary && (summary.crypto.length > 0 || summary.brokers.length > 0);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-5 text-2xl font-semibold tracking-tight text-[var(--color-ink)]">Портфель</h1>
      {error && <p className="mb-4 text-sm text-[#b5503e]">{error}</p>}

      <div className="mb-3.5 grid grid-cols-2 gap-3.5 sm:grid-cols-3">
        <Stat label="Капитал сейчас" value={liveTotalRub ?? latest?.total_value_rub ?? null} />
        <Stat label="Вложено" value={latestInvested} />
        <StatPnl label="P&L" valuRub={pnl} valuePct={pnlPct} />
        <Stat label="Крипто" value={liveCryptoRub ?? latest?.crypto_value_rub ?? null} />
        <Stat label="Брокер" value={liveBrokerRub ?? latest?.broker_value_rub ?? null} />
        <StatXirr xirr={xirr} />
      </div>

      <section className="metric-card mb-3.5">
        <div className="mb-3.5 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--color-ink)]">Капитал во времени</h2>
          <div className="flex gap-1">
            {PERIODS.map((p) => (
              <button
                key={p.label}
                onClick={() => setPeriod(p.label)}
                className={`rounded-lg px-2.5 py-0.5 text-[12px] font-medium transition-colors ${
                  period === p.label
                    ? "bg-[var(--color-accent)] text-white"
                    : "text-[var(--color-muted)] hover:text-[var(--color-ink)]"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        {chartData.length === 0 ? (
          <p className="text-[var(--color-faint)]">
            Снэпшотов пока нет — первый появится после ночного прогона планировщика.
          </p>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <XAxis dataKey="date" fontSize={11} stroke="#9c9c95" tickLine={false} axisLine={{ stroke: "#f0f0ec" }} />
                <YAxis
                  fontSize={11}
                  stroke="#9c9c95"
                  tickLine={false}
                  axisLine={false}
                  width={56}
                  tickFormatter={(v) => `${(v / 1000).toFixed(0)}к`}
                />
                <Tooltip
                  contentStyle={{ borderRadius: 10, border: "1px solid #e7e7e2", fontSize: 12 }}
                  formatter={(value: any) => [`${formatRub(Number(value))} ₽`]}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line
                  type="monotone"
                  dataKey="total"
                  name="Капитал"
                  stroke="#2d4a5e"
                  strokeWidth={2.5}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="invested"
                  name="Вложено"
                  stroke="#9c9c95"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  dot={false}
                />
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
          <h2 className="mb-1 text-sm font-semibold capitalize text-[var(--color-ink)]">{exchange.exchange}</h2>
          {exchange.status !== "ok" ? (
            <p className="text-sm text-[#b5503e]">{exchange.error ?? "Ошибка получения баланса"}</p>
          ) : (
            <div className="overflow-x-auto">
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
            </div>
          )}
        </section>
      ))}

      {summary?.brokers.map((broker) => (
        <section key={broker.broker} className="metric-card mb-3.5">
          <h2 className="mb-1 text-sm font-semibold capitalize text-[var(--color-ink)]">
            {broker.broker} · {broker.account_name}
          </h2>
          {broker.status !== "ok" ? (
            <p className="text-sm text-[#b5503e]">{broker.error ?? "Ошибка получения портфеля"}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11.5px] font-semibold uppercase tracking-wide text-[var(--color-faint)]">
                    <th className="border-b border-[var(--color-border-soft)] py-2.5">Название</th>
                    <th className="border-b border-[var(--color-border-soft)] py-2.5 text-right">Сектор</th>
                    <th className="border-b border-[var(--color-border-soft)] py-2.5 text-right">Стоимость</th>
                    <th className="border-b border-[var(--color-border-soft)] py-2.5 text-right">P&L ₽</th>
                    <th className="border-b border-[var(--color-border-soft)] py-2.5 text-right">P&L %</th>
                  </tr>
                </thead>
                <tbody>
                  {broker.positions.map((p) => (
                    <tr
                      key={p.ticker}
                      onClick={() => router.push(`/investments/assets/${encodeURIComponent(p.ticker)}`)}
                      className="cursor-pointer border-b border-[#f5f5f1] hover:bg-[#fafaf8] transition-colors"
                    >
                      <td className="py-2.5">
                        <span className="font-medium">{p.name}</span>
                        <span className="ml-1.5 text-[11px] text-[var(--color-faint)]">{p.ticker}</span>
                      </td>
                      <td className="py-2.5 text-right text-[12px] text-[var(--color-muted)]">
                        {p.sector ?? "—"}
                      </td>
                      <td className="py-2.5 text-right font-mono font-semibold">{formatRub(p.current_value)} ₽</td>
                      <td
                        className={`py-2.5 text-right font-mono text-[13px] ${
                          p.pnl_rub !== null && p.pnl_rub < 0 ? "text-[#b5503e]" : "text-[#3f6b54]"
                        }`}
                      >
                        {p.pnl_rub !== null ? `${p.pnl_rub >= 0 ? "+" : ""}${formatRub(p.pnl_rub)}` : "—"}
                      </td>
                      <td
                        className={`py-2.5 text-right font-mono text-[13px] ${
                          p.pnl_percent !== null && p.pnl_percent < 0 ? "text-[#b5503e]" : "text-[#3f6b54]"
                        }`}
                      >
                        {p.pnl_percent !== null ? formatPct(p.pnl_percent) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
        <span className="text-[24px] font-semibold leading-none tracking-tight text-[var(--color-ink)]">
          {value !== null ? formatRub(value) : "—"}
        </span>
        <span className="text-[13px] font-normal text-[var(--color-faint)]">₽</span>
      </div>
    </div>
  );
}

function StatPnl({ label, valuRub, valuePct }: { label: string; valuRub: number | null; valuePct: number | null }) {
  const positive = valuRub === null || valuRub >= 0;
  return (
    <div className="metric-card">
      <p className="text-[12.5px] text-[var(--color-muted)]">{label}</p>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span
          className={`text-[24px] font-semibold leading-none tracking-tight ${positive ? "text-[#3f6b54]" : "text-[#b5503e]"}`}
        >
          {valuRub !== null ? `${valuRub >= 0 ? "+" : ""}${formatRub(valuRub)}` : "—"}
        </span>
        {valuePct !== null && (
          <span className={`text-[13px] font-medium ${positive ? "text-[#3f6b54]" : "text-[#b5503e]"}`}>
            {formatPct(valuePct)}
          </span>
        )}
      </div>
    </div>
  );
}

function StatXirr({ xirr }: { xirr: number | null }) {
  const positive = xirr === null || xirr >= 0;
  return (
    <div className="metric-card">
      <p className="text-[12.5px] text-[var(--color-muted)]">XIRR (годовых)</p>
      <div className="mt-1.5 flex items-baseline gap-1">
        <span
          className={`text-[24px] font-semibold leading-none tracking-tight ${positive ? "text-[#3f6b54]" : "text-[#b5503e]"}`}
        >
          {xirr !== null ? `${xirr >= 0 ? "+" : ""}${xirr.toFixed(1)}` : "—"}
        </span>
        {xirr !== null && (
          <span className={`text-[13px] font-medium ${positive ? "text-[#3f6b54]" : "text-[#b5503e]"}`}>%</span>
        )}
      </div>
    </div>
  );
}
