// Shared HTTP client: base URL, token, ETag (304), Retry-After.
// Error bodies are `{ error: CODE }`; the code travels on HttpError.
import { authHeaders } from "../electoral/auth.js";

export interface HttpError extends Error {
  status: number;
  code?: string;
  data?: unknown;
  retryAfterMs?: number;
}

export function apiBase(): string {
  const v = (import.meta as unknown as { env?: Record<string, string> }).env?.["VITE_API_URL"];
  return (v ?? "http://localhost:3000").replace(/\/$/, "");
}

function retryAfterMs(res: Response): number | undefined {
  const ra = res.headers.get("Retry-After");
  if (ra === null) return undefined;
  const s = Number(ra);
  return Number.isNaN(s) ? undefined : s * 1000;
}

async function readError(res: Response): Promise<{ code?: string; data?: unknown }> {
  try {
    const data: unknown = await res.json();
    const code = (data as { error?: unknown }).error;
    return { data, ...(typeof code === "string" ? { code } : {}) };
  } catch {
    return {};
  }
}

function toHttpError(res: Response, extra: { code?: string; data?: unknown }): HttpError {
  const e = new Error(extra.code ?? `HTTP ${res.status}`) as HttpError;
  e.status = res.status;
  if (extra.code !== undefined) e.code = extra.code;
  if (extra.data !== undefined) e.data = extra.data;
  const ra = retryAfterMs(res);
  if (ra !== undefined) e.retryAfterMs = ra;
  return e;
}

/** GET with ETag support: returns { notModified: true } on 304. */
export async function httpGet<T>(
  path: string,
  opts: { token?: string; etag?: string } = {},
): Promise<{ data: T; etag?: string } | { notModified: true }> {
  const headers: Record<string, string> = {};
  if (opts.token !== undefined) Object.assign(headers, authHeaders(opts.token));
  if (opts.etag !== undefined) headers["If-None-Match"] = opts.etag;
  const res = await fetch(`${apiBase()}${path}`, { headers });
  if (res.status === 304) return { notModified: true };
  if (!res.ok) throw toHttpError(res, await readError(res));
  const etagHeader = res.headers.get("ETag");
  const data = (await res.json()) as T;
  if (etagHeader !== null) return { data, etag: etagHeader };
  return { data };
}

export async function httpPost<T, B>(path: string, body: B, opts: { token?: string } = {}): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(opts.token !== undefined ? authHeaders(opts.token) : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw toHttpError(res, await readError(res));
  return (await res.json()) as T;
}
