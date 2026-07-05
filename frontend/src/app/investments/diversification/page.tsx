"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { api, ApiError } from "@/lib/api";
import type { DiversificationBreakdown, DiversificationSlice, SectorDetail } from "@/lib/types";

const COLORS = ["#2d4a5e", "#5e8aa8", "#9c7a33", "#3f6b54", "#b5503e", "#7a6ea3", "#a3a39c", "#cdd7dd"];

function formatRub(value: number): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(value);
}

export default function InvestmentDiversificationPage() {
  const router = useRouter();
  const [data, setData] = useState<DiversificationBreakdown | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Drill-down по сектору
  const [activeSector, setActiveSector] = useState<string | null>(null);
  const [sectorDetail, setSectorDetail] = useState<SectorDetail | null>(null);
  const [sectorLoading, setSectorLoading] = useState(false);
  const [sectorError, setSectorError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<DiversificationBreakdown>("/api/investments/diversification")
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Ошибка загрузки диверсификации"));
  }, []);

  function openSector(sector: string) {
    if (activeSector === sector) {
      setActiveSector(null);
      setSectorDetail(null);
      return;
    }
    setActiveSector(sector);
    setSectorDetail(null);
    setSectorError(null);
    setSectorLoading(true);
    api
      .get<SectorDetail>(`/api/investments/diversification/sector/${encodeURIComponent(sector)}`)
      .then((d) => { setSectorDetail(d); setSectorLoading(false); })
      .catch((err) => { setSectorError(err instanceof ApiError ? err.message : "Ошибка"); setSectorLoading(false); });
  }

  const isEmpty =
    data &&
    data.by_currency.length === 0 &&
    data.by_source.length === 0 &&
    data.by_sector.length === 0 &&
    data.by_asset_class.length === 0;

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-5 text-2xl font-semibold tracking-tight text-[var(--color-ink)]">Диверсификация</h1>
      {error && <p className="mb-4 text-sm text-[#b5503e]">{error}</p>}
      {isEmpty && (
        <p className="text-[var(--color-faint)]">
          Нет данных — подключите биржу или брокера на вкладке «Подключения».
        </p>
      )}

      {data && !isEmpty && (
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <DiversificationPie title="По классу актива" slices={data.by_asset_class} />
          <DiversificationPie title="По валюте" slices={data.by_currency} />
          <DiversificationPie title="По брокеру / бирже" slices={data.by_source} />
          <DiversificationPie
            title="По сектору"
            slices={data.by_sector}
            activeSector={activeSector}
            onSectorClick={openSector}
          />
        </div>
      )}

      {/* Drill-down панель */}
      {activeSector && (
        <section className="metric-card mt-3.5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[var(--color-ink)]">
              Сектор: {activeSector}
              {sectorDetail && (
                <span className="ml-2 text-[12px] font-normal text-[var(--color-muted)]">
                  {formatRub(sectorDetail.value_rub)} ₽ · {sectorDetail.pct}%
                </span>
              )}
            </h2>
            <button
              onClick={() => { setActiveSector(null); setSectorDetail(null); }}
              className="text-[12px] text-[var(--color-muted)] hover:text-[var(--color-ink)] transition-colors"
            >
              ✕ Закрыть
            </button>
          </div>

          {sectorLoading && <p className="text-[13px] text-[var(--color-faint)]">Загрузка…</p>}
          {sectorError && <p className="text-sm text-[#b5503e]">{sectorError}</p>}

          {sectorDetail && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11.5px] font-semibold uppercase tracking-wide text-[var(--color-faint)]">
                    <th className="border-b border-[var(--color-border-soft)] py-2">Название</th>
                    <th className="border-b border-[var(--color-border-soft)] py-2 text-right">Стоимость</th>
                    <th className="border-b border-[var(--color-border-soft)] py-2 text-right">Доля</th>
                    <th className="border-b border-[var(--color-border-soft)] py-2 text-right">P&L %</th>
                    <th className="border-b border-[var(--color-border-soft)] py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {sectorDetail.positions.map((p) => {
                    const posWeight =
                      sectorDetail.value_rub > 0
                        ? ((p.current_value / sectorDetail.value_rub) * 100).toFixed(1)
                        : "0";
                    return (
                      <tr key={p.ticker} className="border-b border-[#f5f5f1]">
                        <td className="py-2">
                          <span className="font-medium">{p.name}</span>
                          <span className="ml-1.5 text-[11px] text-[var(--color-faint)]">{p.ticker}</span>
                        </td>
                        <td className="py-2 text-right font-mono">{formatRub(p.current_value)} ₽</td>
                        <td className="py-2 text-right font-mono text-[var(--color-muted)]">{posWeight}%</td>
                        <td
                          className={`py-2 text-right font-mono text-[13px] ${
                            p.pnl_percent !== null && p.pnl_percent < 0 ? "text-[#b5503e]" : "text-[#3f6b54]"
                          }`}
                        >
                          {p.pnl_percent !== null
                            ? `${p.pnl_percent >= 0 ? "+" : ""}${p.pnl_percent.toFixed(2)}%`
                            : "—"}
                        </td>
                        <td className="py-2 pl-2">
                          <button
                            onClick={() => router.push(`/investments/assets/${encodeURIComponent(p.ticker)}`)}
                            className="text-[12px] text-[var(--color-accent)] hover:underline"
                          >
                            →
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function DiversificationPie({
  title,
  slices,
  activeSector,
  onSectorClick,
}: {
  title: string;
  slices: DiversificationSlice[];
  activeSector?: string | null;
  onSectorClick?: (sector: string) => void;
}) {
  return (
    <section className="metric-card">
      <h2 className="mb-3 text-sm font-semibold text-[var(--color-ink)]">{title}</h2>
      {slices.length === 0 ? (
        <p className="text-[13px] text-[var(--color-faint)]">Нет данных.</p>
      ) : (
        <>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="value_rub"
                  nameKey="label"
                  innerRadius={32}
                  outerRadius={68}
                  onClick={onSectorClick ? (entry: any) => onSectorClick(entry.label) : undefined}
                  style={onSectorClick ? { cursor: "pointer" } : undefined}
                >
                  {slices.map((s, i) => (
                    <Cell
                      key={i}
                      fill={COLORS[i % COLORS.length]}
                      opacity={activeSector && activeSector !== s.label ? 0.4 : 1}
                      stroke={activeSector === s.label ? "#1a2d3a" : "none"}
                      strokeWidth={activeSector === s.label ? 2 : 0}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => `${Math.round(Number(value)).toLocaleString("ru-RU")} ₽`}
                  contentStyle={{ borderRadius: 10, border: "1px solid #e7e7e2", fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          {/* Легенда с % */}
          <div className="mt-1 space-y-1">
            {slices.map((s, i) => (
              <div
                key={s.label}
                className={`flex items-center justify-between text-[12px] rounded px-1 py-0.5 transition-colors ${
                  onSectorClick ? "cursor-pointer hover:bg-[#f5f5f1]" : ""
                } ${activeSector === s.label ? "bg-[#f0f4f7]" : ""}`}
                onClick={onSectorClick ? () => onSectorClick(s.label) : undefined}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full"
                    style={{ background: COLORS[i % COLORS.length] }}
                  />
                  <span className="text-[var(--color-ink)]">{s.label}</span>
                </div>
                <span className="font-mono text-[var(--color-muted)]">{s.pct}%</span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
