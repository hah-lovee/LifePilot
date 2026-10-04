/** Formatting shared by the Финансы pages. */

const MONTHS = [
  "январь", "февраль", "март", "апрель", "май", "июнь",
  "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь",
];

/** 12672 -> "12 672 ₽". Kopecks are shown only when there are any — budget
 *  rows are whole roubles, and ",00" everywhere just adds noise. */
export function money(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const fractional = Math.abs(value % 1) > 0.005;
  return `${value.toLocaleString("ru-RU", {
    minimumFractionDigits: fractional ? 2 : 0,
    maximumFractionDigits: 2,
  })} ₽`;
}

/** Same, but with an explicit sign — for differences, where the direction is
 *  the point. */
export function signedMoney(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  if (value === 0) return "0 ₽";
  return `${value > 0 ? "+" : "−"}${money(Math.abs(value))}`;
}

/** "2026-09" -> "сентябрь 2026" */
export function monthLabel(month: string): string {
  const [year, index] = month.split("-");
  const name = MONTHS[Number(index) - 1] ?? month;
  return `${name} ${year}`;
}

/** "2026-09" shifted by whole months, staying in "YYYY-MM". */
export function shiftMonth(month: string, by: number): string {
  const [year, index] = month.split("-").map(Number);
  const total = year * 12 + (index - 1) + by;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

export function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;
}

/** Reads a typed amount, accepting both separators.
 *
 *  `<input type="number">` refuses a comma outright — the value comes back
 *  empty — and the Russian numeric keypad puts a comma on the decimal key, so
 *  money fields are plain text inputs parsed here instead. Returns null for
 *  anything that is not a number, so a typo cannot be saved as 0. */
export function parseAmount(raw: string): number | null {
  const cleaned = raw.trim().replace(/\s| /g, "").replace(",", ".");
  if (!cleaned) return null;
  if (!/^-?\d*\.?\d*$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}
