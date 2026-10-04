"use client";

import { useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { money } from "@/lib/money";
import type {
  FinanceGroup,
  SavingsSummary,
  StatementResult,
  UnmappedCategory,
} from "@/lib/types";

/** Import of a Т-Банк CSV export.
 *
 *  Two passes by design: the statement knows the bank's category, not which
 *  статья of this budget it belongs to. The first upload writes everything
 *  already mapped and lists what it could not place; you answer those once and
 *  press the button again. The file stays in state so "again" is one click, and
 *  nothing doubles — every row carries a fingerprint. */
export function StatementImport({ onDone }: { onDone: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<StatementResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [groups, setGroups] = useState<FinanceGroup[]>([]);
  const [accounts, setAccounts] = useState<SavingsSummary["accounts"]>([]);
  const [saved, setSaved] = useState<Record<string, string>>({});

  async function send(target: File) {
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.append("file", target);
    try {
      const data = await api.upload<StatementResult>("/api/finance/import-statement", form);
      setResult(data);
      if (data.unmapped.length > 0 && groups.length === 0) {
        const [structure, savings] = await Promise.all([
          api.get<FinanceGroup[]>("/api/finance/structure"),
          api.get<SavingsSummary>("/api/finance/savings"),
        ]);
        setGroups(structure.filter((g) => !g.archived));
        setAccounts(savings.accounts.filter((a) => !a.archived));
      }
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось прочитать выписку");
      setResult(null);
    } finally {
      setBusy(false);
    }
  }

  async function saveRule(entry: UnmappedCategory, value: string) {
    const key = `${entry.category}|${entry.direction}`;
    setError(null);
    const body: Record<string, unknown> = {
      category: entry.category,
      direction: entry.direction,
    };
    if (value === "ignore") body.ignored = true;
    else if (value.startsWith("account:")) body.savings_account_id = Number(value.slice(8));
    else if (value.startsWith("item:")) body.item_id = Number(value.slice(5));
    else return;

    try {
      await api.put("/api/finance/import-rules", body);
      setSaved((prev) => ({ ...prev, [key]: value }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось сохранить правило");
    }
  }

  const allAnswered =
    result !== null &&
    result.unmapped.length > 0 &&
    result.unmapped.every((u) => saved[`${u.category}|${u.direction}`]);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        hidden
        onChange={(e) => {
          const picked = e.target.files?.[0];
          e.target.value = "";
          if (picked) {
            setFile(picked);
            setSaved({});
            send(picked);
          }
        }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="btn-secondary py-1.5 text-[13px]"
        title="Выписка Т-Банка в CSV. Даты и описания берутся как есть; категории нужно один раз разложить по статьям."
      >
        {busy ? "Читаю выписку…" : "Импорт выписки"}
      </button>

      {error && <span className="text-[12px] text-[#b5503e]">{error}</span>}

      {result && (
        <div className="card w-full p-4">
          <p className="text-[13px] text-[var(--color-ink)]">
            {result.period_from && result.period_to
              ? `Выписка за ${result.period_from} — ${result.period_to}: `
              : "Выписка: "}
            операций {result.rows}, внесено {result.imported}
            {result.duplicates > 0 && `, повторов ${result.duplicates}`}
            {result.ignored > 0 && `, пропущено по правилам ${result.ignored}`}
          </p>

          {result.unmapped.length === 0 ? (
            <p className="mt-1 text-[12.5px] text-[#3f6b54]">
              Всё разложено по статьям.
              {result.duplicates > 0 &&
                " Повторы — операции, которые уже были загружены раньше, они не задвоились."}
            </p>
          ) : (
            <>
              <p className="mt-2.5 text-[12.5px] leading-relaxed text-[var(--color-muted)]">
                Эти категории банка я не знаю, куда отнести. Выберите статью один раз — дальше
                выписки будут раскладываться сами. «Не учитывать» подходит для переводов между
                своими счетами: это не трата.
              </p>
              <table className="mt-3 w-full text-[12.5px]">
                <thead>
                  <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--color-faint)]">
                    <th className="pb-1.5">Категория банка</th>
                    <th className="pb-1.5 text-right">Операций</th>
                    <th className="pb-1.5 text-right">Сумма</th>
                    <th className="pb-1.5 pl-3">Куда отнести</th>
                  </tr>
                </thead>
                <tbody>
                  {result.unmapped.map((entry) => {
                    const key = `${entry.category}|${entry.direction}`;
                    return (
                      <tr key={key} className="border-t border-[#f5f5f1]">
                        <td className="py-2 pr-2">
                          <span className="text-[var(--color-ink)]">{entry.category}</span>
                          <span className="ml-1.5 text-[11px] text-[var(--color-faint)]">
                            {entry.direction === "out" ? "расход" : "приход"}
                          </span>
                          {entry.examples.length > 0 && (
                            <span className="block truncate text-[11px] text-[var(--color-faint)]">
                              {entry.examples.join(", ")}
                            </span>
                          )}
                        </td>
                        <td className="py-2 text-right font-mono">{entry.count}</td>
                        <td className="py-2 text-right font-mono font-semibold">
                          {money(entry.total)}
                        </td>
                        <td className="py-2 pl-3">
                          <select
                            value={saved[key] ?? ""}
                            onChange={(e) => saveRule(entry, e.target.value)}
                            className="input-field w-full py-1 text-[12.5px]"
                          >
                            <option value="">— выберите —</option>
                            <option value="ignore">Не учитывать</option>
                            {groups
                              .filter((g) =>
                                entry.direction === "in"
                                  ? g.kind === "income" || g.counts_as_savings
                                  : g.kind === "expense"
                              )
                              .map((group) => (
                                <optgroup key={group.id} label={group.name}>
                                  {group.items
                                    .filter((i) => !i.archived)
                                    .map((item) => (
                                      <option key={item.id} value={`item:${item.id}`}>
                                        {item.name}
                                      </option>
                                    ))}
                                </optgroup>
                              ))}
                            {accounts.length > 0 && (
                              <optgroup label="Накопительные счета">
                                {accounts.map((account) => (
                                  <option key={account.id} value={`account:${account.id}`}>
                                    {account.name}
                                  </option>
                                ))}
                              </optgroup>
                            )}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {file && (
                <button
                  onClick={() => send(file)}
                  disabled={busy}
                  className={allAnswered ? "btn-primary mt-3 py-1.5 text-[13px]" : "btn-secondary mt-3 py-1.5 text-[13px]"}
                >
                  {allAnswered ? "Загрузить выписку снова" : "Загрузить снова (что разложено)"}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
