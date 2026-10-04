"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api";
import type { FinanceGroup, FinanceItem } from "@/lib/types";

export default function FinanceItemsPage() {
  const [groups, setGroups] = useState<FinanceGroup[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [addingGroup, setAddingGroup] = useState(false);

  const load = useCallback(async () => {
    try {
      setGroups(await api.get<FinanceGroup[]>("/api/finance/structure"));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось загрузить статьи");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const expenseGroups = groups.filter((g) => g.kind === "expense");
  const incomeGroups = groups.filter((g) => g.kind === "income");
  const visible = (list: FinanceGroup[]) => list.filter((g) => showArchived || !g.archived);
  const targets = groups.filter((g) => !g.archived);

  return (
    <div className="bg-[var(--color-page)] p-4 sm:p-7">
      <div className="mx-auto max-w-3xl">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-ink)]">Статьи</h1>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-[12.5px] text-[var(--color-muted)]">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
              />
              показать скрытые
            </label>
            {!addingGroup && (
              <button
                onClick={() => setAddingGroup(true)}
                className="btn-secondary py-1.5 text-[13px]"
              >
                + группа
              </button>
            )}
          </div>
        </div>
        <p className="mb-5 max-w-[660px] text-[13px] leading-relaxed text-[var(--color-muted)]">
          Здесь статьи переименовываются и переезжают между группами. Статья уносит с собой всю
          историю, поэтому «жд билеты» из «Развлечений» в «Транспорт» переносятся вместе с прошлыми
          месяцами — отчёты за них пересчитаются. Рядом с каждой статьёй видно, сколько трат на ней
          висит: это и есть цена удаления.
        </p>

        {error && <p className="mb-4 text-sm text-[#b5503e]">{error}</p>}

        {addingGroup && (
          <NewGroup
            onDone={() => {
              setAddingGroup(false);
              load();
            }}
            onCancel={() => setAddingGroup(false)}
          />
        )}

        {incomeGroups.length > 0 && (
          <>
            <h2 className="mb-2 text-[11.5px] font-semibold uppercase tracking-wide text-[var(--color-faint)]">
              Доходы
            </h2>
            <div className="mb-5 flex flex-col gap-3">
              {visible(incomeGroups).map((group) => (
                <GroupCard
                  key={group.id}
                  group={group}
                  targets={targets}
                  showArchived={showArchived}
                  onChanged={load}
                />
              ))}
            </div>
          </>
        )}

        <h2 className="mb-2 text-[11.5px] font-semibold uppercase tracking-wide text-[var(--color-faint)]">
          Расходы
        </h2>
        <div className="flex flex-col gap-3">
          {visible(expenseGroups).map((group) => (
            <GroupCard
              key={group.id}
              group={group}
              targets={targets}
              showArchived={showArchived}
              onChanged={load}
            />
          ))}
        </div>

        {groups.length === 0 && (
          <p className="text-[var(--color-faint)]">
            Групп пока нет — они появятся после импорта или создания типовых категорий на вкладке
            «Месяц».
          </p>
        )}
      </div>
    </div>
  );
}

function GroupCard({
  group,
  targets,
  showArchived,
  onChanged,
}: {
  group: FinanceGroup;
  targets: FinanceGroup[];
  showArchived: boolean;
  onChanged: () => void;
}) {
  const [name, setName] = useState(group.name);
  const [adding, setAdding] = useState(false);
  const [newItem, setNewItem] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setName(group.name), [group.name]);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось сохранить");
    }
  }

  const items = group.items.filter((i) => showArchived || !i.archived);
  const totalTransactions = group.items.reduce((sum, i) => sum + i.transactions, 0);

  async function addItem(e: FormEvent) {
    e.preventDefault();
    const value = newItem.trim();
    if (!value) return;
    await run(() => api.post("/api/finance/items", { group_id: group.id, name: value }));
    setNewItem("");
    setAdding(false);
  }

  return (
    <section className={group.archived ? "card p-4 opacity-60" : "card p-4"}>
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            const trimmed = name.trim();
            if (!trimmed) {
              setName(group.name);
              return;
            }
            if (trimmed !== group.name) run(() => api.patch(`/api/finance/groups/${group.id}`, { name: trimmed }));
          }}
          className="input-field min-w-[140px] flex-1 py-1 text-[13px] font-semibold"
        />
        <label
          className="flex items-center gap-1.5 text-[12px] text-[var(--color-muted)]"
          title="Деньги, попавшие сюда, считаются отложенными, а не потраченными. На этом строится норма сбережений."
        >
          <input
            type="checkbox"
            checked={group.counts_as_savings}
            onChange={(e) =>
              run(() =>
                api.patch(`/api/finance/groups/${group.id}`, {
                  counts_as_savings: e.target.checked,
                })
              )
            }
          />
          сбережения
        </label>
        <button
          onClick={() =>
            run(() =>
              api.patch(`/api/finance/groups/${group.id}`, { archived: !group.archived })
            )
          }
          className="btn-text text-[12px]"
          title={
            group.archived
              ? "Вернуть группу в работу"
              : "Скрыть группу: она пропадёт из новых месяцев, но история останется"
          }
        >
          {group.archived ? "вернуть" : "скрыть"}
        </button>
        {group.items.length === 0 && (
          <button
            onClick={() => run(() => api.delete(`/api/finance/groups/${group.id}`))}
            className="text-[#a2a29b] hover:text-[#b5503e]"
            title="Удалить пустую группу"
          >
            ×
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <p className="text-[12.5px] text-[var(--color-faint)]">Статей нет.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {items.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              groupId={group.id}
              targets={targets.filter((g) => g.kind === group.kind)}
              onChanged={onChanged}
            />
          ))}
        </ul>
      )}

      {totalTransactions > 0 && (
        <p className="mt-2 text-[11px] text-[var(--color-faint)]">
          всего трат по группе: {totalTransactions}
        </p>
      )}

      {adding ? (
        <form onSubmit={addItem} className="mt-2.5 flex flex-wrap gap-2">
          <input
            autoFocus
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            placeholder="Название статьи"
            className="input-field min-w-[140px] flex-1 py-1 text-[13px]"
          />
          <button type="submit" className="btn-secondary py-1 text-[12.5px]">
            Добавить
          </button>
          <button type="button" onClick={() => setAdding(false)} className="btn-text text-[12.5px]">
            Отмена
          </button>
        </form>
      ) : (
        <button onClick={() => setAdding(true)} className="btn-text mt-2 text-[12.5px]">
          + статья
        </button>
      )}

      {error && <p className="mt-2 text-[12px] text-[#b5503e]">{error}</p>}
    </section>
  );
}

function ItemRow({
  item,
  groupId,
  targets,
  onChanged,
}: {
  item: FinanceItem;
  groupId: number;
  targets: FinanceGroup[];
  onChanged: () => void;
}) {
  const [name, setName] = useState(item.name);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setName(item.name), [item.name]);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось сохранить");
    }
  }

  return (
    <li className={item.archived ? "opacity-55" : undefined}>
      <div className="flex flex-wrap items-center gap-2 rounded-md bg-[#fbfbfa] px-2.5 py-1.5">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            const trimmed = name.trim();
            if (!trimmed) {
              setName(item.name);
              return;
            }
            if (trimmed !== item.name) run(() => api.patch(`/api/finance/items/${item.id}`, { name: trimmed }));
          }}
          className="input-field min-w-[130px] flex-1 py-0.5 text-[13px]"
        />

        <select
          value={groupId}
          onChange={(e) =>
            run(() =>
              api.patch(`/api/finance/items/${item.id}`, { group_id: Number(e.target.value) })
            )
          }
          className="input-field w-auto py-0.5 text-[12.5px]"
          title="Перенести статью в другую группу вместе со всей историей"
        >
          {targets.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </select>

        <span
          className="w-[86px] flex-shrink-0 text-right text-[11.5px] text-[var(--color-faint)]"
          title={
            item.transactions === 0
              ? "Трат по статье нет"
              : `${item.transactions} трат за ${item.months} мес.`
          }
        >
          {item.transactions === 0 ? "нет трат" : `${item.transactions} трат`}
        </span>

        <button
          onClick={() => run(() => api.patch(`/api/finance/items/${item.id}`, { archived: !item.archived }))}
          className="btn-text flex-shrink-0 text-[12px]"
          title={
            item.archived
              ? "Вернуть статью в работу"
              : "Скрыть: статья пропадёт из новых месяцев, история останется"
          }
        >
          {item.archived ? "вернуть" : "скрыть"}
        </button>

        <button
          onClick={() => (item.transactions > 0 ? setConfirming(true) : run(() => api.delete(`/api/finance/items/${item.id}`)))}
          className="flex-shrink-0 text-[#a2a29b] hover:text-[#b5503e]"
          title="Удалить статью"
        >
          ×
        </button>
      </div>

      {confirming && (
        <div className="mt-1 flex flex-wrap items-center gap-2 rounded-md bg-[#fdf6f4] px-2.5 py-1.5 text-[12px]">
          <span className="text-[#b5503e]">
            Удалить «{item.name}» вместе с {item.transactions} тратами за {item.months} мес.? Отчёты
            за эти месяцы изменятся. Если нужно просто убрать её из новых месяцев — выберите
            «скрыть».
          </span>
          <button
            onClick={() => run(() => api.delete(`/api/finance/items/${item.id}`))}
            className="btn-secondary py-0.5 text-[12px]"
          >
            Удалить
          </button>
          <button onClick={() => setConfirming(false)} className="btn-text text-[12px]">
            Отмена
          </button>
        </div>
      )}

      {error && <p className="mt-1 text-[12px] text-[#b5503e]">{error}</p>}
    </li>
  );
}

function NewGroup({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    try {
      await api.post("/api/finance/groups", { name: name.trim(), kind });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось создать группу");
    }
  }

  return (
    <form onSubmit={submit} className="card mb-4 flex flex-wrap items-end gap-2.5 p-4">
      <label className="min-w-[160px] flex-1">
        <span className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-[var(--color-faint)]">
          Название группы
        </span>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Например, Транспорт"
          className="input-field w-full py-1.5 text-[13px]"
        />
      </label>
      <label>
        <span className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-[var(--color-faint)]">
          Вид
        </span>
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as "expense" | "income")}
          className="input-field w-auto py-1.5 text-[13px]"
        >
          <option value="expense">расходы</option>
          <option value="income">доходы</option>
        </select>
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
