"use client";

interface DateNavProps {
  date: string;
  onChange: (date: string) => void;
}

function offsetDate(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const arrowCls =
  "flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-[9px] border border-[#e0e0db] bg-white text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors";

export function DateNav({ date, onChange }: DateNavProps) {
  return (
    <div className="flex items-center gap-1">
      <button type="button" onClick={() => onChange(offsetDate(date, -1))} className={arrowCls}>
        ←
      </button>
      <input
        type="date"
        value={date}
        onChange={(e) => onChange(e.target.value)}
        className="input-field w-auto"
      />
      <button type="button" onClick={() => onChange(offsetDate(date, 1))} className={arrowCls}>
        →
      </button>
    </div>
  );
}
