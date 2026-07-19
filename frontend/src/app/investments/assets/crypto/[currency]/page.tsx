"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { clearSessionCache, ALL_INVESTMENTS_CACHE_KEYS } from "@/lib/session-cache";
import type { InvestmentsSummary, UnifiedCryptoTrade, WalletBalance } from "@/lib/types";

function formatRub(value: number): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(value);
}

export default function CryptoAssetPage() {
  return (
    <Suspense>
      <CryptoAssetContent />
    </Suspense>
  );
}

function CryptoAssetContent() {
  const params = useParams<{ currency: string }>();
  const currency = decodeURIComponent(params.currency).toUpperCase();
  const searchParams = useSearchParams();
  const portfolioName = searchParams.get("portfolio") ?? "";

  const [wallet, setWallet] = useState<WalletBalance | null>(null);
  const [trades, setTrades] = useState<UnifiedCryptoTrade[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const today = new Date().toISOString().slice(0, 10);
  const [tradeDate, setTradeDate] = useState(today);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [quantity, setQuantity] = useState("");
  const [priceUsdt, setPriceUsdt] = useState("");
  const [feeUsdt, setFeeUsdt] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [summary, history] = await Promise.all([
        api.get<InvestmentsSummary>("/api/investments/summary"),
        api.get<UnifiedCryptoTrade[]>(
          `/api/investments/crypto-trades?portfolio_name=${encodeURIComponent(portfolioName)}&currency=${encodeURIComponent(currency)}`
        ),
      ]);
      const exchange = summary.crypto.find(
        (e) => (e.portfolio_name || e.exchange) === portfolioName
      );
      const w = exchange?.balances.find((b) => b.currency.toUpperCase() === currency) ?? null;
      setWallet(w);
      setTrades(history);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currency, portfolioName]);

  async function addTrade(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api.post("/api/investments/manual-trades", {
        portfolio_name: portfolioName,
        currency,
        trade_date: tradeDate,
        side,
        quantity: Number(quantity),
        price_usdt: Number(priceUsdt),
        fee_usdt: feeUsdt ? Number(feeUsdt) : null,
        note: note.trim() || null,
      });
      setQuantity("");
      setPriceUsdt("");
      setFeeUsdt("");
      setNote("");
      clearSessionCache(ALL_INVESTMENTS_CACHE_KEYS);
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось сохранить сделку");
    } finally {
      setSaving(false);
    }
  }

  async function removeTrade(id: number) {
    setError(null);
    try {
      await api.delete(`/api/investments/manual-trades/${id}`);
      clearSessionCache(ALL_INVESTMENTS_CACHE_KEYS);
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось удалить сделку");
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/investments"
        className="mb-4 inline-flex items-center gap-1 text-[13px] text-[var(--color-muted)] hover:text-[var(--color-ink)] transition-colors"
      >
        ← Портфель
      </Link>
      <div className="mb-5 flex items-center gap-2.5">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-ink)]">{currency}</h1>
        <span className="rounded-md bg-[#f2f2ee] px-2 py-0.5 text-[11.5px] text-[var(--color-muted)]">
          {portfolioName}
        </span>
      </div>

      {error && <p className="mb-4 text-sm text-[#b5503e]">{error}</p>}

      {wallet && (
        <div className="mb-3.5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="metric-card">
            <p className="text-[12.5px] text-[var(--color-muted)]">Количество</p>
            <p className="mt-1.5 text-[18px] font-semibold text-[var(--color-ink)]">{wallet.total}</p>
          </div>
          <div className="metric-card">
            <p className="text-[12.5px] text-[var(--color-muted)]">Стоимость</p>
            <p className="mt-1.5 text-[18px] font-semibold text-[var(--color-ink)]">
              {wallet.value_usdt?.toFixed(2) ?? "—"} $
            </p>
          </div>
          <div className="metric-card">
            <p className="text-[12.5px] text-[var(--color-muted)]">Себестоимость (за ед.)</p>
            <p className="mt-1.5 text-[18px] font-semibold text-[var(--color-ink)]">
              {wallet.average_price !== null ? wallet.average_price.toFixed(4) : "—"} $
            </p>
          </div>
          <div className="metric-card">
            <p className="text-[12.5px] text-[var(--color-muted)]">P&L</p>
            <p
              className={`mt-1.5 text-[18px] font-semibold ${
                wallet.pnl_usdt !== null && wallet.pnl_usdt < 0 ? "text-[#b5503e]" : "text-[#3f6b54]"
              }`}
            >
              {wallet.pnl_usdt !== null
                ? `${wallet.pnl_usdt >= 0 ? "+" : ""}${wallet.pnl_usdt.toFixed(2)} $ (${wallet.pnl_percent?.toFixed(1)}%)`
                : "—"}
            </p>
          </div>
        </div>
      )}

      <section className="metric-card mb-3.5">
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-ink)]">История сделок</h2>
        {loading ? (
          <p className="text-[13px] text-[var(--color-faint)]">Загрузка…</p>
        ) : trades.length === 0 ? (
          <p className="text-[13px] text-[var(--color-faint)]">
            Сделок пока нет — ни синхронизированных с биржи, ни внесённых вручную.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--color-faint)]">
                  <th className="border-b border-[var(--color-border-soft)] py-2">Дата</th>
                  <th className="border-b border-[var(--color-border-soft)] py-2">Источник</th>
                  <th className="border-b border-[var(--color-border-soft)] py-2">Тип</th>
                  <th className="border-b border-[var(--color-border-soft)] py-2 text-right">Кол-во</th>
                  <th className="border-b border-[var(--color-border-soft)] py-2 text-right">Цена</th>
                  <th className="border-b border-[var(--color-border-soft)] py-2 text-right">Комиссия</th>
                  <th className="border-b border-[var(--color-border-soft)] py-2"></th>
                </tr>
              </thead>
              <tbody>
                {trades.map((t, i) => (
                  <tr key={`${t.source}-${t.manual_id ?? i}`} className="border-b border-[#f5f5f1]">
                    <td className="py-2 font-mono text-[12.5px]">{t.trade_date}</td>
                    <td className="py-2 text-[12.5px]">
                      {t.source === "auto" ? (
                        <span title="Синхронизировано с биржи">🔄 авто</span>
                      ) : (
                        <span title={t.note ?? undefined}>✎ вручную</span>
                      )}
                    </td>
                    <td className="py-2 text-[12.5px]">{t.side === "buy" ? "покупка" : "продажа"}</td>
                    <td className="py-2 text-right font-mono">{t.quantity}</td>
                    <td className="py-2 text-right font-mono">{t.price_usdt} $</td>
                    <td className="py-2 text-right font-mono text-[var(--color-muted)]">
                      {t.fee_usdt || "—"}
                    </td>
                    <td className="py-2 pl-2 text-right">
                      {t.source === "manual" && t.manual_id !== null && (
                        <button
                          onClick={() => removeTrade(t.manual_id!)}
                          className="text-[var(--color-faint)] hover:text-[#b5503e]"
                        >
                          ×
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="metric-card">
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-ink)]">Добавить сделку вручную</h2>
        <p className="mb-3.5 text-[12.5px] leading-relaxed text-[var(--color-muted)]">
          Для случаев, которые биржа не может отдать сама (переименованный/делистнутый тикер, перевод с другой
          биржи или кошелька). Комиссию укажи отдельным полем — она войдёт в себестоимость.
        </p>
        <form onSubmit={addTrade} className="flex flex-col gap-2.5">
          <div className="flex flex-wrap gap-2">
            <input
              type="date"
              value={tradeDate}
              onChange={(e) => setTradeDate(e.target.value)}
              required
              className="input-field w-auto"
            />
            <select value={side} onChange={(e) => setSide(e.target.value as "buy" | "sell")} className="input-field w-auto">
              <option value="buy">Покупка</option>
              <option value="sell">Продажа</option>
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              type="number"
              step="any"
              min="0"
              placeholder="Количество"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              required
              className="input-field w-[130px]"
            />
            <input
              type="number"
              step="any"
              min="0"
              placeholder="Цена, $ за ед."
              value={priceUsdt}
              onChange={(e) => setPriceUsdt(e.target.value)}
              required
              className="input-field w-[130px]"
            />
            <input
              type="number"
              step="any"
              min="0"
              placeholder="Комиссия, $ (всего)"
              value={feeUsdt}
              onChange={(e) => setFeeUsdt(e.target.value)}
              className="input-field w-[150px]"
            />
          </div>
          <input
            type="text"
            placeholder="Комментарий (необязательно) — например «было TON, переименовали в GRAM»"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="input-field w-full"
          />
          <button type="submit" disabled={saving} className="btn-primary self-start disabled:opacity-50">
            {saving ? "Сохраняется…" : "Добавить"}
          </button>
        </form>
      </section>
    </div>
  );
}
