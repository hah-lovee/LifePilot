"use client";

import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api";
import type { ManualCryptoTrade } from "@/lib/types";

export function ManualCostBasisModal({
  portfolioName,
  currency,
  onClose,
  onSaved,
}: {
  portfolioName: string;
  currency: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [trades, setTrades] = useState<ManualCryptoTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const [tradeDate, setTradeDate] = useState(today);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [quantity, setQuantity] = useState("");
  const [priceUsdt, setPriceUsdt] = useState("");
  const [feeUsdt, setFeeUsdt] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadTrades() {
    setLoading(true);
    try {
      const list = await api.get<ManualCryptoTrade[]>(
        `/api/investments/manual-trades?portfolio_name=${encodeURIComponent(portfolioName)}&currency=${encodeURIComponent(currency)}`
      );
      setTrades(list);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Ошибка загрузки сделок");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTrades();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      await loadTrades();
      onSaved();
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
      await loadTrades();
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось удалить сделку");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-base font-semibold text-[var(--color-ink)]">
            Себестоимость: {currency}
          </h2>
          <button onClick={onClose} className="text-[var(--color-faint)] hover:text-[var(--color-ink)]">
            ✕
          </button>
        </div>
        <p className="mb-4 text-[12.5px] leading-relaxed text-[var(--color-muted)]">
          Биржа не смогла определить среднюю цену покупки автоматически (например, из-за переименования
          тикера). Впиши свои реальные сделки — комиссию учитывай отдельным полем, она войдёт в себестоимость.
        </p>

        {error && <p className="mb-3 text-sm text-[#b5503e]">{error}</p>}

        {loading ? (
          <p className="text-[13px] text-[var(--color-faint)]">Загрузка…</p>
        ) : (
          <>
            {trades.length > 0 && (
              <div className="mb-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--color-faint)]">
                      <th className="border-b border-[var(--color-border-soft)] py-1.5">Дата</th>
                      <th className="border-b border-[var(--color-border-soft)] py-1.5">Тип</th>
                      <th className="border-b border-[var(--color-border-soft)] py-1.5 text-right">Кол-во</th>
                      <th className="border-b border-[var(--color-border-soft)] py-1.5 text-right">Цена</th>
                      <th className="border-b border-[var(--color-border-soft)] py-1.5 text-right">Комиссия</th>
                      <th className="border-b border-[var(--color-border-soft)] py-1.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {trades.map((t) => (
                      <tr key={t.id} className="border-b border-[#f5f5f1]">
                        <td className="py-1.5 font-mono text-[12.5px]">{t.trade_date}</td>
                        <td className="py-1.5 text-[12.5px]">{t.side === "buy" ? "покупка" : "продажа"}</td>
                        <td className="py-1.5 text-right font-mono">{t.quantity}</td>
                        <td className="py-1.5 text-right font-mono">{t.price_usdt} $</td>
                        <td className="py-1.5 text-right font-mono text-[var(--color-muted)]">
                          {t.fee_usdt ?? "—"}
                        </td>
                        <td className="py-1.5 pl-2 text-right">
                          <button
                            onClick={() => removeTrade(t.id)}
                            className="text-[var(--color-faint)] hover:text-[#b5503e]"
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <form onSubmit={addTrade} className="flex flex-col gap-2.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-faint)]">
                Добавить сделку
              </p>
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
          </>
        )}
      </div>
    </div>
  );
}
