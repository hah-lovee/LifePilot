"use client";

import { Suspense, useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { currentMonth, money, monthLabel, shiftMonth, signedMoney, todayIso } from "@/lib/money";
import type { FinanceTransaction, MonthGroup, MonthItem, MonthView } from "@/lib/types";

export default function FinancePage() {
  return (
    <Suspense>
      <FinanceMonth />
    </Suspense>
  );
}

function FinanceMonth() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [month, setMonth] = useState(searchParams.get("month") ?? currentMonth());
  const [view, setView] = useState<MonthView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openItem, setOpenItem] = useState<number | null>(null);

  const load = useCallback(async (target: string) => {
    try {
      setView(await api.get<MonthView>(`/api/finance/month?month=${target}`));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось загрузить месяц");
    }
  }, []);

  useEffect(() => {
    load(month);
  }, [month, load]);

  function changeMonth(target: string) {
    setMonth(target);
    setOpenItem(null);
    router.replace(`/finance?month=${target}`, { scroll: false });
  }

  async function act(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load(month);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось сохранить");
    } finally {
      setBusy(false);
    }
  }

  const savePlan = (itemId: number, amount: number | null) =>
    act(() => api.put("/api/finance/plans", { item_id: itemId, month, amount }));

  const addItem = (groupId: number, name: string) =>
    act(() => api.post("/api/finance/items", { group_id: groupId, name, month }));

  const removeFromMonth = (itemId: number) =>
    act(() => api.delete(`/api/finance/plans?item_id=${itemId}&month=${month}`));

  return (
    <div className="bg-[var(--color-page)] p-4 sm:p-7">
      <div className="mx-auto max-w-5xl">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-ink)]">
            {monthLabel(month)}
          </h1>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => changeMonth(shiftMonth(month, -1))}
              className="btn-secondary px-2.5 py-1.5 text-[13px]"
              aria-label="Предыдущий месяц"
            >
              ←
            </button>
            <input
              type="month"
              value={month}
              onChange={(e) => e.target.value && changeMonth(e.target.value)}
              className="input-field w-auto py-1.5 text-[13px]"
            />
            <button
              onClick={() => changeMonth(shiftMonth(month, 1))}
              className="btn-secondary px-2.5 py-1.5 text-[13px]"
              aria-label="Следующий месяц"
            >
              →
            </button>
          </div>
        </div>

        {error && <p className="mb-4 text-sm text-[#b5503e]">{error}</p>}

        {view && view.is_empty && (
          <EmptyMonth month={month} view={view} onDone={() => load(month)} />
        )}

        {view && !view.is_empty && (
          <>
            <div className="mb-3.5 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
              <Summary label="Доходы" planned={view.planned_income} actual={view.actual_income} />
              <Summary
                label="Расходы"
                planned={view.planned_expenses}
                actual={view.actual_expenses}
              />
              <Summary
                label="Остаток"
                planned={view.planned_balance}
                actual={view.actual_balance}
              />
              <div className="metric-card">
                <p className="text-[11.5px] font-semibold uppercase tracking-wide text-[var(--color-faint)]">
                  Разница
                </p>
                <p
                  className="mt-1 text-xl font-semibold tracking-tight"
                  style={{ color: view.balance_difference >= 0 ? "#3f6b54" : "#b5503e" }}
                >
                  {signedMoney(view.balance_difference)}
                </p>
                <p className="text-[11.5px] text-[var(--color-faint)]">
                  фактический остаток минус плановый
                </p>
              </div>
            </div>

            {view.income.map((group) => (
              <GroupCard
                key={group.group_id}
                group={group}
                month={month}
                busy={busy}
                openItem={openItem}
                onToggleItem={(id) => setOpenItem(openItem === id ? null : id)}
                onSavePlan={savePlan}
                onAddItem={addItem}
                onRemoveFromMonth={removeFromMonth}
                onChanged={() => load(month)}
                className="mb-3.5"
              />
            ))}

            <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
              {view.expenses.map((group) => (
                <GroupCard
                  key={group.group_id}
                  group={group}
                  month={month}
                  busy={busy}
                  openItem={openItem}
                  onToggleItem={(id) => setOpenItem(openItem === id ? null : id)}
                  onSavePlan={savePlan}
                  onAddItem={addItem}
                  onRemoveFromMonth={removeFromMonth}
                  onChanged={() => load(month)}
                />
              ))}
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <CopyMonth month={month} source={view.previous_month} onDone={() => load(month)} />
              <ImportXlsx onDone={() => load(month)} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Summary({
  label,
  planned,
  actual,
}: {
  label: string;
  planned: number;
  actual: number;
}) {
  return (
    <div className="metric-card">
      <p className="text-[11.5px] font-semibold uppercase tracking-wide text-[var(--color-faint)]">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold tracking-tight text-[var(--color-ink)]">
        {money(actual)}
      </p>
      <p className="text-[11.5px] text-[var(--color-faint)]">план {money(planned)}</p>
    </div>
  );
}

function GroupCard({
  group,
  month,
  busy,
  openItem,
  onToggleItem,
  onSavePlan,
  onAddItem,
  onRemoveFromMonth,
  onChanged,
  className = "",
}: {
  group: MonthGroup;
  month: string;
  busy: boolean;
  openItem: number | null;
  onToggleItem: (itemId: number) => void;
  onSavePlan: (itemId: number, amount: number | null) => Promise<void>;
  onAddItem: (groupId: number, name: string) => Promise<void>;
  onRemoveFromMonth: (itemId: number) => Promise<void>;
  onChanged: () => void;
  className?: string;
}) {
  const [newItem, setNewItem] = useState("");
  const [adding, setAdding] = useState(false);

  async function submitItem(e: FormEvent) {
    e.preventDefault();
    const name = newItem.trim();
    if (!name) return;
    await onAddItem(group.group_id, name);
    setNewItem("");
    setAdding(false);
  }

  return (
    <section className={`card p-4 ${className}`}>
      <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-[var(--color-ink)]">
          {group.name}
          {group.counts_as_savings && (
            <span className="ml-1.5 text-[11px] font-normal text-[var(--color-faint)]">
              идёт в сбережения
            </span>
          )}
        </h2>
        <span
          className="text-[12.5px] font-semibold"
          style={{ color: group.difference >= 0 ? "#3f6b54" : "#b5503e" }}
        >
          {signedMoney(group.difference)}
        </span>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-faint)]">
            <th className="pb-1.5 text-left font-semibold">Статья</th>
            <th className="pb-1.5 text-right font-semibold">План</th>
            <th className="pb-1.5 text-right font-semibold">Факт</th>
            <th className="w-7" />
          </tr>
        </thead>
        <tbody>
          {group.items.map((item) => (
            <ItemRow
              key={item.item_id}
              item={item}
              month={month}
              busy={busy}
              isOpen={openItem === item.item_id}
              onToggle={() => onToggleItem(item.item_id)}
              onSavePlan={onSavePlan}
              onRemoveFromMonth={onRemoveFromMonth}
              onChanged={onChanged}
            />
          ))}
          <tr className="border-t border-[var(--color-border-soft)]">
            <td className="pt-2 text-[12.5px] font-semibold text-[var(--color-muted)]">Итого</td>
            <td className="pt-2 text-right font-mono text-[12.5px] text-[var(--color-muted)]">
              {money(group.planned)}
            </td>
            <td className="pt-2 text-right font-mono text-[13px] font-semibold text-[var(--color-ink)]">
              {money(group.actual)}
            </td>
            <td />
          </tr>
        </tbody>
      </table>

      {adding ? (
        <form onSubmit={submitItem} className="mt-2.5 flex flex-wrap gap-2">
          <input
            autoFocus
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            placeholder="Название статьи"
            className="input-field min-w-[120px] flex-1 py-1 text-[13px]"
          />
          <button type="submit" className="btn-secondary py-1 text-[12.5px]">
            Добавить
          </button>
          <button
            type="button"
            onClick={() => {
              setAdding(false);
              setNewItem("");
            }}
            className="btn-text text-[12.5px]"
          >
            Отмена
          </button>
        </form>
      ) : (
        <button onClick={() => setAdding(true)} className="btn-text mt-2 text-[12.5px]">
          + статья
        </button>
      )}
    </section>
  );
}

function ItemRow({
  item,
  month,
  busy,
  isOpen,
  onToggle,
  onSavePlan,
  onRemoveFromMonth,
  onChanged,
}: {
  item: MonthItem;
  month: string;
  busy: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onSavePlan: (itemId: number, amount: number | null) => Promise<void>;
  onRemoveFromMonth: (itemId: number) => Promise<void>;
  onChanged: () => void;
}) {
  const [plan, setPlan] = useState(item.planned === null ? "" : String(item.planned));

  // The row is re-rendered from the server after every save, so the input has
  // to follow the value it was given rather than keep its own stale copy.
  useEffect(() => {
    setPlan(item.planned === null ? "" : String(item.planned));
  }, [item.planned]);

  const isRule = item.percent_of_income !== null;

  return (
    <>
      <tr className="border-t border-[#f5f5f1]">
        <td className="py-1.5 pr-2">
          <button
            onClick={onToggle}
            className="text-left text-[13px] text-[var(--color-ink)] hover:text-[var(--color-accent)]"
          >
            {item.name}
            {item.transactions > 0 && (
              <span className="ml-1.5 text-[11px] text-[var(--color-faint)]">
                {item.transactions}
              </span>
            )}
          </button>
        </td>
        <td className="py-1.5 text-right">
          {isRule ? (
            <span
              className="font-mono text-[12.5px] text-[var(--color-muted)]"
              title={`${(item.percent_of_income! * 100).toFixed(1)}% от планового дохода`}
            >
              {money(item.planned)}
              <span className="ml-1 text-[10.5px] text-[var(--color-faint)]">
                {(item.percent_of_income! * 100).toFixed(0)}%
              </span>
            </span>
          ) : (
            <input
              type="number"
              min="0"
              step="100"
              value={plan}
              disabled={busy}
              onChange={(e) => setPlan(e.target.value)}
              onBlur={() => {
                const next = plan === "" ? null : Number(plan);
                if (next !== item.planned) onSavePlan(item.item_id, next);
              }}
              className="input-field w-[86px] py-0.5 text-right font-mono text-[12.5px]"
            />
          )}
        </td>
        <td className="py-1.5 text-right font-mono text-[13px] font-semibold text-[var(--color-ink)]">
          {item.actual === 0 ? (
            <span className="font-normal text-[var(--color-faint)]">—</span>
          ) : (
            money(item.actual)
          )}
          {item.difference !== null && item.difference < 0 && (
            <span className="ml-1 text-[10.5px] text-[#b5503e]">{signedMoney(item.difference)}</span>
          )}
        </td>
        <td className="py-1.5 text-right">
          {item.transactions === 0 && item.in_plan && (
            <button
              onClick={() => onRemoveFromMonth(item.item_id)}
              title="Убрать статью из этого месяца"
              className="text-[#a2a29b] hover:text-[#b5503e]"
            >
              ×
            </button>
          )}
        </td>
      </tr>
      {isOpen && (
        <tr>
          <td colSpan={4} className="pb-2">
            <Transactions itemId={item.item_id} month={month} onChanged={onChanged} />
          </td>
        </tr>
      )}
    </>
  );
}

function Transactions({
  itemId,
  month,
  onChanged,
}: {
  itemId: number;
  month: string;
  onChanged: () => void;
}) {
  const [rows, setRows] = useState<FinanceTransaction[] | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [when, setWhen] = useState(() => defaultDay(month));
  const [error, setError] = useState<string | null>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setRows(
      await api.get<FinanceTransaction[]>(
        `/api/finance/transactions?month=${month}&item_id=${itemId}`
      )
    );
  }, [itemId, month]);

  useEffect(() => {
    load().catch(() => setError("Не удалось загрузить траты"));
  }, [load]);

  async function add(e: FormEvent) {
    e.preventDefault();
    const value = Number(amount);
    if (!value || value <= 0) return;
    setError(null);
    try {
      await api.post("/api/finance/transactions", {
        item_id: itemId,
        happened_on: when,
        amount: value,
        note: note.trim() || null,
      });
      setAmount("");
      setNote("");
      await load();
      onChanged();
      amountRef.current?.focus();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось добавить");
    }
  }

  async function remove(id: number) {
    setError(null);
    try {
      await api.delete(`/api/finance/transactions/${id}`);
      await load();
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось удалить");
    }
  }

  return (
    <div className="rounded-lg bg-[#fbfbfa] p-2.5">
      {rows && rows.length > 0 && (
        <ul className="mb-2 flex flex-col gap-1">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center gap-2 text-[12.5px]">
              <span className="w-[42px] flex-shrink-0 font-mono text-[var(--color-faint)]">
                {row.happened_on.slice(8)}.{row.happened_on.slice(5, 7)}
              </span>
              <span className="w-[86px] flex-shrink-0 text-right font-mono font-semibold text-[var(--color-ink)]">
                {money(row.amount)}
              </span>
              <span className="min-w-0 flex-1 truncate text-[var(--color-muted)]">
                {row.source === "xlsx" ? (
                  <span
                    className="text-[var(--color-faint)]"
                    title="Из импортированного файла. В листах не было дат, поэтому стоит первое число."
                  >
                    {row.note ?? "из файла"}
                  </span>
                ) : (
                  row.note ?? ""
                )}
              </span>
              <button
                onClick={() => remove(row.id)}
                className="flex-shrink-0 text-[#a2a29b] hover:text-[#b5503e]"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {rows && rows.length === 0 && (
        <p className="mb-2 text-[12px] text-[var(--color-faint)]">Трат по этой статье пока нет.</p>
      )}

      <form onSubmit={add} className="flex flex-wrap items-center gap-1.5">
        <input
          type="date"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          className="input-field w-[130px] py-1 text-[12.5px]"
        />
        <input
          ref={amountRef}
          type="number"
          min="0"
          step="1"
          placeholder="Сумма"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="input-field w-[88px] py-1 text-[12.5px]"
        />
        <input
          placeholder="Заметка"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="input-field min-w-[100px] flex-1 py-1 text-[12.5px]"
        />
        <button type="submit" className="btn-secondary py-1 text-[12.5px]">
          +
        </button>
      </form>
      {error && <p className="mt-1.5 text-[12px] text-[#b5503e]">{error}</p>}
    </div>
  );
}

/** Today when the month on screen is the current one, otherwise its first day —
 *  entering last month's spending should not date it to today. */
function defaultDay(month: string): string {
  const today = todayIso();
  return today.startsWith(month) ? today : `${month}-01`;
}

function EmptyMonth({
  month,
  view,
  onDone,
}: {
  month: string;
  view: MonthView;
  onDone: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не получилось");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-5">
      <p className="mb-1 font-medium text-[var(--color-ink)]">
        В {monthLabel(month)} пока ничего нет
      </p>
      <p className="mb-4 max-w-[620px] text-[13px] leading-relaxed text-[var(--color-muted)]">
        Месяц начинается не с пустого листа: структуру можно перенести из предыдущего, загрузить из
        старого файла бюджета или взять типовую и дальше править под себя.
      </p>
      <div className="flex flex-wrap gap-2.5">
        {view.previous_month && (
          <button
            disabled={busy}
            onClick={() =>
              run(() =>
                api.post(`/api/finance/month/${month}/copy`, {
                  source_month: view.previous_month,
                  include_amounts: true,
                })
              )
            }
            className="btn-primary py-1.5 text-[13px]"
          >
            Скопировать из {monthLabel(view.previous_month)}
          </button>
        )}
        <ImportXlsx onDone={onDone} />
        <button
          disabled={busy}
          onClick={() =>
            run(async () => {
              await api.post("/api/finance/bootstrap");
              await api.post(`/api/finance/month/${month}/fill`);
            })
          }
          className="btn-secondary py-1.5 text-[13px]"
        >
          Создать типовые категории
        </button>
      </div>
      {error && <p className="mt-3 text-sm text-[#b5503e]">{error}</p>}
    </div>
  );
}

function CopyMonth({
  month,
  source,
  onDone,
}: {
  month: string;
  source: string | null;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  if (!source) return null;
  return (
    <button
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await api.post(`/api/finance/month/${month}/copy`, {
            source_month: source,
            include_amounts: true,
          });
          onDone();
        } finally {
          setBusy(false);
        }
      }}
      className="btn-secondary py-1.5 text-[13px]"
      title="Добавит статьи, которых в этом месяце ещё нет. Существующие не тронет."
    >
      Дополнить из {monthLabel(source)}
    </button>
  );
}

type ImportLine = { file: string; ok: boolean; text: string };

function ImportXlsx({ onDone }: { onDone: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [lines, setLines] = useState<ImportLine[]>([]);
  const [running, setRunning] = useState(false);

  /** Files are sent one at a time, oldest month first, so a later month's plan
   *  overwrites an earlier one rather than the other way round — and so one bad
   *  file reports itself instead of failing the whole batch. */
  async function upload(files: File[]) {
    setRunning(true);
    setLines([]);
    const ordered = [...files].sort((a, b) => a.name.localeCompare(b.name));
    for (const file of ordered) {
      const form = new FormData();
      form.append("file", file);
      try {
        const result = await api.upload<{
          month_label: string;
          items_created: number;
          transactions: number;
        }>("/api/finance/import-xlsx", form);
        setLines((prev) => [
          ...prev,
          {
            file: file.name,
            ok: true,
            text: `${result.month_label} — трат ${result.transactions}, новых статей ${result.items_created}`,
          },
        ]);
      } catch (err) {
        setLines((prev) => [
          ...prev,
          {
            file: file.name,
            ok: false,
            text: err instanceof ApiError ? err.message : "не удалось импортировать",
          },
        ]);
      }
    }
    setRunning(false);
    onDone();
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) upload(files);
          e.target.value = "";
        }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={running}
        className="btn-secondary py-1.5 text-[13px]"
        title="Файлы «Личный бюджет на месяц», можно выбрать сразу несколько. Месяц берётся из названия: 09.2026.xlsx, 09.26.xlsx"
      >
        {running ? "Импортирую…" : "Импорт из Excel"}
      </button>
      {lines.length > 0 && (
        <ul className="w-full flex-col gap-0.5 text-[12px]">
          {lines.map((line) => (
            <li key={line.file} style={{ color: line.ok ? "#3f6b54" : "#b5503e" }}>
              {line.file} — {line.text}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
