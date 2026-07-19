// ?? (not ||) — an empty string is a deliberate, valid value in production
// (same-origin requests through the reverse proxy), not "unset".
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8002";

const TOKEN_KEY = "life_pilot_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// FastAPI's `detail` is a plain string for most errors, but for 422
// validation failures it's an array of {msg, loc, ...} objects — passing
// that straight into Error's message renders as "[object Object]".
function describeDetail(detail: unknown, fallback: string): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const messages = detail.map((item) =>
      typeof item === "object" && item !== null && "msg" in item ? String((item as { msg: unknown }).msg) : String(item)
    );
    if (messages.length > 0) return messages.join("; ");
  }
  return fallback;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (options.body && !(options.body instanceof URLSearchParams) && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (!res.ok) {
    let detail: unknown = res.statusText;
    try {
      const data = await res.json();
      detail = data.detail ?? detail;
    } catch {
      // body wasn't JSON, keep statusText
    }
    throw new ApiError(res.status, describeDetail(detail, res.statusText));
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body !== undefined ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: body !== undefined ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body !== undefined ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  upload: <T>(path: string, formData: FormData, method: "POST" | "PATCH" = "POST") =>
    request<T>(path, { method, body: formData }),
};

export async function login(email: string, password: string): Promise<string> {
  const body = new URLSearchParams({ username: email, password });
  const res = await fetch(`${API_URL}/api/auth/login`, { method: "POST", body });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ detail: res.statusText }));
    throw new ApiError(res.status, describeDetail(data.detail, res.statusText));
  }
  const data = await res.json();
  return data.access_token as string;
}

export async function register(
  email: string,
  name: string,
  password: string,
  inviteCode: string
): Promise<void> {
  await request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, name, password, invite_code: inviteCode }),
  });
}
