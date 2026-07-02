"use client";

interface DateNavProps {
  date: string;
  onChange: (date: string) => void;
}

function offsetDate(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T00:00:00");
  d.setDate(d.getDate() + days);
  // Use local date components — toISOString() returns UTC which shifts the date
  // in timezones ahead of UTC (e.g. UTC+3: local midnight = UTC 21:00 prev day).
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
