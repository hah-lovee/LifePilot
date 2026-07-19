"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { AssetDetail } from "@/lib/types";

function formatRub(value: number): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(value);
}

function formatPct(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-[#f0f0ec] ${className ?? ""}`} />;
}

function AssetLoadingSkeleton() {
  return (
    <>
      <div className="mb-3.5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="metric-card flex flex-col gap-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-5 w-16" />
          </div>
        ))}
      </div>
      <div className="mb-3.5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="metric-card flex flex-col gap-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-5 w-14" />
          </div>
        ))}
      </div>
      <div className="metric-card">
        <Skeleton className="mb-3 h-4 w-40" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex justify-between border-b border-[#f5f5f1] py-2.5">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>
    </>
  );
}

const INSTRUMENT_LABELS: Record<string, string> = {
  share: "Акция",
  bond: "Облигация",
  etf: "ETF",
  futures: "Фьючерс",
  currency: "Валюта",
  crypto: "Криптовалюта",
};

export default function AssetDetailPage() {
  const { ticker } = useParams<{ ticker: string }>();
  const [asset, setAsset] = useState<AssetDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ticker) return;
    api
      .get<AssetDetail>(`/api/investments/assets/${encodeURIComponent(ticker)}`)
      .then(setAsset)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Ошибка загрузки актива"));
  }, [ticker]);

  const pnlPositive = asset ? asset.unrealized_pnl_rub >= 0 : true;
  const pnlColor = pnlPositive ? "text-[#3f6b54]" : "text-[#b5503e]";

  return (
    <div className="mx-auto max-w-3xl">
      {/* Шапка */}
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <Link
            href="/investments"
            className="mb-2 inline-flex items-center gap-1 text-[13px] text-[var(--color-muted)] hover:text-[var(--color-ink)] transition-colors"
          >
            ← Портфель
          </Link>
          {asset && (
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-ink)]">{asset.name}</h1>
              <span className="rounded-md bg-[#f2f2ee] px-2 py-0.5 text-[12px] text-[var(--color-muted)]">
                {asset.ticker}
              </span>
              <span className="rounded-md bg-[#eaf0f5] px-2 py-0.5 text-[12px] text-[#2d4a5e]">
                {INSTRUMENT_LABELS[asset.instrument_type] ?? asset.instrument_type}
              </span>
              {asset.sector && (
                <span className="rounded-md bg-[#f2f0e8] px-2 py-0.5 text-[12px] text-[#7a6010]">
                  {asset.sector}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {error && <p className="mb-4 text-sm text-[#b5503e]">{error}</p>}

      {!asset && !error && <AssetLoadingSkeleton />}

      {asset && (
        <>
          {/* Метрики */}
          <div className="mb-3.5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="Текущая цена" value={`${formatRub(asset.current_price)} ${asset.currency.toUpperCase()}`} />
            <Metric label="Количество" value={String(asset.quantity)} />
            <Metric label="Себестоимость" value={`${formatRub(asset.cost_basis_rub)} ₽`} />
            <Metric label="Стоимость позиции" value={`${formatRub(asset.position_value_rub)} ₽`} />
          </div>

          <div className="mb-3.5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="metric-card">
              <p className="text-[12.5px] text-[var(--color-muted)]">Нереализованный P&L</p>
              <p className={`mt-1.5 text-[22px] font-semibold leading-none tracking-tight ${pnlColor}`}>
                {formatPct(asset.unrealized_pnl_pct)}
              </p>
              <p className={`mt-0.5 text-[13px] font-mono ${pnlColor}`}>
                {asset.unrealized_pnl_rub >= 0 ? "+" : ""}{formatRub(asset.unrealized_pnl_rub)} ₽
              </p>
            </div>
            <Metric label="Доля в портфеле" value={`${asset.portfolio_weight_pct}%`} />
            {asset.yield_on_cost_pct > 0 ? (
              <Metric label="YoC (доходность к покупке)" value={`${asset.yield_on_cost_pct.toFixed(2)}%`} />
            ) : (
              <Metric label="YoC (доходность к покупке)" value="—" />
            )}
            {asset.annual_income_rub > 0 ? (
              <Metric label="Прогноз выплат / год" value={`${formatRub(asset.annual_income_rub)} ₽`} />
            ) : (
              <Metric label="Прогноз выплат / год" value="—" />
            )}
          </div>

          {/* Предстоящие выплаты */}
          <section className="metric-card">
            <h2 className="mb-3 text-sm font-semibold text-[var(--color-ink)]">Предстоящие выплаты</h2>
            {asset.upcoming_dividends.length === 0 ? (
              <p className="text-[13px] text-[var(--color-faint)]">
                Выплат не найдено — инструмент не платит дивиденды/купоны, или данных нет.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11.5px] font-semibold uppercase tracking-wide text-[var(--color-faint)]">
                      <th className="border-b border-[var(--color-border-soft)] py-2">Дата</th>
                      <th className="border-b border-[var(--color-border-soft)] py-2">Тип</th>
                      <th className="border-b border-[var(--color-border-soft)] py-2 text-right">На ед.</th>
                      <th className="border-b border-[var(--color-border-soft)] py-2 text-right">Итого</th>
                    </tr>
                  </thead>
                  <tbody>
                    {asset.upcoming_dividends.map((ev, i) => (
                      <tr key={`${ev.payment_date}-${i}`} className="border-b border-[#f5f5f1]">
                        <td className="py-2 font-mono text-[13px]">{ev.payment_date}</td>
                        <td className="py-2 text-[12px] text-[var(--color-muted)]">
                          {ev.instrument_type === "bond" ? "купон" : "дивиденд"}
                        </td>
                        <td className="py-2 text-right font-mono">
                          {ev.amount_per_unit.toFixed(2)} {ev.currency}
                        </td>
                        <td className="py-2 text-right font-mono font-semibold">
                          {formatRub(ev.total_amount)} ₽
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-card">
      <p className="text-[12.5px] text-[var(--color-muted)]">{label}</p>
      <p className="mt-1.5 text-[18px] font-semibold leading-snug tracking-tight text-[var(--color-ink)]">
        {value}
      </p>
    </div>
  );
}
