"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api";
import { money, parseAmount, signedMoney, todayIso } from "@/lib/money";
import type { SavingsAccount, SavingsOperation, SavingsSummary } from "@/lib/types";

const KIND_LABEL: Record<SavingsOperation["kind"], string> = {
  contribution: "взнос",
  withdrawal: "снятие",
  interest: "проценты",
};

export default function SavingsPage() {
  const [summary, setSummary] = useState<SavingsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      setSummary(await api.get<SavingsSummary>("/api/finance/savings"));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось загрузить счета");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const active = summary?.accounts.filter((a) => !a.archived) ?? [];

  return (
    <div className="bg-[var(--color-page)] p-4 sm:p-7">
      <div className="mx-auto max-w-3xl">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-ink)]">
            Накопления
          </h1>
          {!adding && (
            <button onClick={() => setAdding(true)} className="btn-secondary py-1.5 text-[13px]">
              + счёт
            </button>
          )}
        </div>
        <p className="mb-5 max-w-[640px] text-[13px] leading-relaxed text-[var(--color-muted)]">
          Накопительные счета и цели: подушка, отпуск, что угодно ещё. Остаток считается из операций,
          а не вводится отдельно — поэтому он не может разойтись с историей. Проценты вносятся
          отдельным видом операции, чтобы было видно, сколько набежало само.
        </p>

        {error && <p className="mb-4 text-sm text-[#b5503e]">{error}</p>}

        {adding && (
          <NewAccount
            onDone={() => {
              setAdding(false);
              load();
            }}
            onCancel={() => setAdding(false)}
          />
        )}

        {summary && active.length > 0 && (
          <div className="mb-3.5 grid grid-cols-2 gap-3.5">
            <div className="metric-card">
              <p className="text-[11.5px] font-semibold uppercase tracking-wide text-[var(--color-faint)]">
                Всего накоплено
              </p>
              <p className="mt-1 text-xl font-semibold tracking-tight text-[var(--color-ink)]">
                {money(summary.total_balance)}
              </p>
            </div>
            <div className="metric-card">
              <p className="text-[11.5px] font-semibold uppercase tracking-wide text-[var(--color-faint)]">
                Сумма целей
              </p>
              <p className="mt-1 text-xl font-semibold tracking-tight text-[var(--color-ink)]">
                {money(summary.total_goal)}
              </p>
              {summary.total_goal !== null && summary.total_goal > 0 && (
                <p className="text-[11.5px] text-[var(--color-faint)]">
                  пройдено {Math.round((summary.total_balance / summary.total_goal) * 100)}%
                </p>
              )}
            </div>
          </div>
        )}

        {summary && active.length === 0 && !adding && (
          <p className="text-[var(--color-faint)]">
            Счетов пока нет — добавьте первый, например «Подушка безопасности».
          </p>
        )}

        <div className="flex flex-col gap-3.5">
          {active.map((account) => (
            <AccountCard
              key={account.id}
              account={account}
              isOpen={open === account.id}
              onToggle={() => setOpen(open === account.id ? null : account.id)}
              onChanged={load}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function AccountCard({
  account,
  isOpen,
  onToggle,
  onChanged,
}: {
  account: SavingsAccount;
  isOpen: boolean;
  onToggle: () => void;
  onChanged: () => void;
}) {
  return (
    <section className="card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <button onClick={onToggle} className="text-left">
          <h2 className="font-semibold text-[var(--color-ink)]">{account.name}</h2>
          <p className="text-[11.5px] text-[var(--color-faint)]">
            {account.last_operation_on
              ? `последняя операция ${account.last_operation_on}`
              : "операций пока нет"}
          </p>
        </button>
        <div className="text-right">
          <p className="text-lg font-semibold tracking-tight text-[var(--color-ink)]">
            {money(account.balance)}
          </p>
          {account.goal_amount !== null && (
            <p className="text-[11.5px] text-[var(--color-faint)]">
              цель {money(account.goal_amount)}
              {account.goal_date && ` к ${account.goal_date}`}
            </p>
          )}
        </div>
      </div>

      {account.goal_progress_pct !== null && (
        <div className="mt-2.5">
          <div className="h-2 overflow-hidden rounded-full bg-[#f0f0ec]">
            <div
              className="h-full rounded-full"
              style={{
                width: `${account.goal_progress_pct}%`,
                backgroundColor: account.goal_progress_pct >= 100 ? "#3f6b54" : "#2d4a5e",
              }}
            />
          </div>
          <div className="mt-1 flex flex-wrap justify-between gap-2 text-[11.5px] text-[var(--color-faint)]">
            <span>{account.goal_progress_pct}% цели</span>
            {account.monthly_needed !== null && (
              <span>чтобы успеть к сроку — {money(account.monthly_needed)} в месяц</span>
            )}
          </div>
        </div>
      )}

      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-[var(--color-faint)]">
        <span>внесено {money(account.contributed)}</span>
        {account.withdrawn > 0 && <span>снято {money(account.withdrawn)}</span>}
        {account.interest > 0 && (
          <span className="text-[#3f6b54]">проценты {money(account.interest)}</span>
        )}
      </div>

      {isOpen && <Operations account={account} onChanged={onChanged} />}
    </section>
  );
}

function Operations({
  account,
  onChanged,
}: {
  account: SavingsAccount;
  onChanged: () => void;
}) {
  const [rows, setRows] = useState<SavingsOperation[] | null>(null);
  const [amount, setAmount] = useState("");
  const [kind, setKind] = useState<SavingsOperation["kind"]>("contribution");
  const [when, setWhen] = useState(todayIso);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRows(await api.get<SavingsOperation[]>(`/api/finance/savings/${account.id}/operations`));
  }, [account.id]);

  useEffect(() => {
    load().catch(() => setError("Не удалось загрузить операции"));
  }, [load]);

  async function add(e: FormEvent) {
    e.preventDefault();
    const value = parseAmount(amount);
    if (value === null || value === 0) {
      setError("Сумма не похожа на число");
      return;
    }
    setError(null);
    try {
      await api.post(`/api/finance/savings/${account.id}/operations`, {
        happened_on: when,
        amount: value,
        kind,
        note: note.trim() || null,
      });
      setAmount("");
      setNote("");
      await load();
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось добавить операцию");
    }
  }

  async function remove(id: number) {
    setError(null);
    try {
      await api.delete(`/api/finance/savings/${account.id}/operations/${id}`);
      await load();
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось удалить");
    }
  }

  return (
    <div className="mt-3 rounded-lg bg-[#fbfbfa] p-3">
      {rows && rows.length > 0 && (
        <ul className="mb-2.5 flex flex-col gap-1">
          {rows.map((row) => (
            <OperationRow
              key={row.id}
              accountId={account.id}
              row={row}
              onSaved={async () => {
                await load();
                onChanged();
              }}
              onRemove={() => remove(row.id)}
            />
          ))}
        </ul>
      )}
      {rows && rows.length === 0 && (
        <p className="mb-2.5 text-[12px] text-[var(--color-faint)]">Операций пока нет.</p>
      )}

      <form onSubmit={add} className="flex flex-wrap items-center gap-1.5">
        <input
          type="date"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          className="input-field w-[132px] py-1 text-[12.5px]"
        />
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as SavingsOperation["kind"])}
          className="input-field w-auto py-1 text-[12.5px]"
        >
          <option value="contribution">взнос</option>
          <option value="withdrawal">снятие</option>
          <option value="interest">проценты</option>
        </select>
        <input
          type="text"
          inputMode="decimal"
          placeholder="Сумма"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="input-field w-[92px] py-1 text-[12.5px]"
        />
        <input
          placeholder="Заметка"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="input-field min-w-[100px] flex-1 py-1 text-[12.5px]"
        />
        <button type="submit" className="btn-secondary py-1 text-[12.5px]">
          Добавить
        </button>
      </form>
      <p className="mt-1.5 text-[11px] text-[var(--color-faint)]">
        Сумму вводите положительной — знак ставится по виду операции. Копейки можно через запятую
        или точку: 12345,67
      </p>
      {error && <p className="mt-1.5 text-[12px] text-[#b5503e]">{error}</p>}
    </div>
  );
}

/** One movement on a savings account, edited in place.
 *
 *  The amount is always typed positive — the kind decides the sign, both here
 *  and on the server — so switching "взнос" to "снятие" is enough to correct a
 *  mistake, with nothing to re-type. */
function OperationRow({
  accountId,
  row,
  onSaved,
  onRemove,
}: {
  accountId: number;
  row: SavingsOperation;
  onSaved: () => Promise<void>;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [when, setWhen] = useState(row.happened_on);
  const [kind, setKind] = useState<SavingsOperation["kind"]>(row.kind);
  const [amount, setAmount] = useState(String(Math.abs(row.amount)));
  const [note, setNote] = useState(row.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function start() {
    setWhen(row.happened_on);
    setKind(row.kind);
    setAmount(String(Math.abs(row.amount)));
    setNote(row.note ?? "");
    setError(null);
    setEditing(true);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    const value = parseAmount(amount);
    if (value === null || value === 0) {
      setError("Сумма не похожа на число");
      return;
    }
    setBusy(true);
    try {
      await api.patch(`/api/finance/savings/${accountId}/operations/${row.id}`, {
        happened_on: when,
        kind,
        amount: Math.abs(value),
        note: note.trim() || null,
      });
      setEditing(false);
      await onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось сохранить");
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <li>
        <form onSubmit={save} className="flex flex-wrap items-center gap-1.5">
          <input
            type="date"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            className="input-field w-[132px] py-1 text-[12.5px]"
          />
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as SavingsOperation["kind"])}
            className="input-field w-auto py-1 text-[12.5px]"
          >
            <option value="contribution">взнос</option>
            <option value="withdrawal">снятие</option>
            <option value="interest">проценты</option>
          </select>
          <input
            autoFocus
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="input-field w-[92px] py-1 text-[12.5px]"
          />
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Заметка"
            className="input-field min-w-[100px] flex-1 py-1 text-[12.5px]"
          />
          <button type="submit" disabled={busy} className="btn-secondary py-1 text-[12.5px]">
            Сохранить
          </button>
          <button type="button" onClick={() => setEditing(false)} className="btn-text text-[12.5px]">
            Отмена
          </button>
          {error && <span className="w-full text-[12px] text-[#b5503e]">{error}</span>}
        </form>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-2 text-[12.5px]">
      <span className="w-[76px] flex-shrink-0 font-mono text-[var(--color-faint)]">
        {row.happened_on}
      </span>
      <span
        className="w-[96px] flex-shrink-0 text-right font-mono font-semibold"
        style={{ color: row.amount >= 0 ? "#3f6b54" : "#b5503e" }}
      >
        {signedMoney(row.amount)}
      </span>
      <span className="w-[66px] flex-shrink-0 text-[var(--color-faint)]">
        {KIND_LABEL[row.kind]}
      </span>
      <span className="min-w-0 flex-1 truncate text-[var(--color-muted)]">{row.note ?? ""}</span>
      <button onClick={start} className="btn-text flex-shrink-0 text-[12px]">
        Изменить
      </button>
      <button onClick={onRemove} className="flex-shrink-0 text-[#a2a29b] hover:text-[#b5503e]">
        ×
      </button>
    </li>
  );
}

function NewAccount({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [goalDate, setGoalDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    try {
      const parsedGoal = goal.trim() ? parseAmount(goal) : null;
      if (goal.trim() && parsedGoal === null) {
        setError("Цель не похожа на число");
        return;
      }
      await api.post("/api/finance/savings", {
        name: name.trim(),
        goal_amount: parsedGoal,
        goal_date: goalDate || null,
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось создать счёт");
    }
  }

  return (
    <form onSubmit={submit} className="card mb-3.5 flex flex-wrap items-end gap-2.5 p-4">
      <label className="min-w-[160px] flex-1">
        <span className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-[var(--color-faint)]">
          Название
        </span>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Подушка безопасности"
          className="input-field w-full py-1.5 text-[13px]"
        />
      </label>
      <label>
        <span className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-[var(--color-faint)]">
          Цель, ₽
        </span>
        <input
          type="text"
          inputMode="decimal"
          placeholder="300000"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          className="input-field w-[120px] py-1.5 text-[13px]"
        />
      </label>
      <label>
        <span className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-[var(--color-faint)]">
          К дате
        </span>
        <input
          type="date"
          value={goalDate}
          onChange={(e) => setGoalDate(e.target.value)}
          className="input-field w-[150px] py-1.5 text-[13px]"
        />
      </label>
      <button type="submit" className="btn-primary py-1.5 text-[13px]">
        Создать
      </button>
      <button type="button" onClick={onCancel} className="btn-text text-[13px]">
        Отмена
      </button>
      {error && <p className="w-full text-sm text-[#b5503e]">{error}</p>}
    </form>
  );
}
