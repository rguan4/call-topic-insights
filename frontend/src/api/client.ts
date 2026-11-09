import type { ApiError } from '@cti/shared';

const TOKEN_KEY = 'cti.session';
export const UNAUTHORIZED_EVENT = 'cti:unauthorized';

/** Session token from POST /api/auth/login. */
export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem('cti.user'); // left over from the old dev sign-in
  } catch {
    // Storage unavailable (private mode): the session lasts until reload.
  }
}

export class ApiRequestError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

function buildQuery(params?: object): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries((params ?? {}) as Record<string, unknown>)) {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `?${s}` : '';
}

async function request<T>(method: string, path: string, params?: object, body?: unknown): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`/api${path}${buildQuery(params)}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  if (!res.ok) {
    // A 401 on any call (not the login itself) means the session expired: AuthContext signs out.
    if (res.status === 401 && token && path !== '/auth/login') window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    let body: ApiError | undefined;
    try {
      body = (await res.json()) as ApiError;
    } catch {
      body = undefined;
    }
    throw new ApiRequestError(res.status, body?.error.code ?? 'http_error', body?.error.message ?? `Request failed (${res.status}).`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function apiGet<T>(path: string, params?: object): Promise<T> {
  return request<T>('GET', path, params);
}

/** POST/PATCH/PUT/DELETE with an optional JSON body. `params` become the query string. */
export function apiSend<T>(method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string, body?: unknown, params?: object): Promise<T> {
  return request<T>(method, path, params, body);
}
