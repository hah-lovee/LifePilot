// In-memory cache for the current app session — deliberately NOT localStorage.
// Lives only as long as this JS execution context does: warm across SPA
// navigations between pages, but wiped on a full reload/new tab. Used so a
// page doesn't refetch every time the user switches back to it, while never
// showing data older than "since I opened the app".
const cache = new Map<string, unknown>();

export function getSessionCache<T>(key: string): T | undefined {
  return cache.get(key) as T | undefined;
}

export function setSessionCache<T>(key: string, value: T): void {
  cache.set(key, value);
}

export function clearSessionCache(keys: string[]): void {
  for (const key of keys) cache.delete(key);
}

// Shared so mutating pages (e.g. investments/connections) can invalidate what
// the read pages (portfolio, diversification, dividends) have cached, instead
// of those pages silently showing pre-change data until a full reload.
export const INVESTMENTS_CACHE_KEYS = {
  summary: "investments_summary",
  netWorth: "investments_net_worth",
  diversification: "investments_diversification",
  dividends: "investments_dividends",
  monthly: "investments_monthly",
} as const;

export const ALL_INVESTMENTS_CACHE_KEYS = Object.values(INVESTMENTS_CACHE_KEYS);
