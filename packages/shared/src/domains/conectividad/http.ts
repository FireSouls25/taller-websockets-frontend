// Cliente HTTP compartido: base URL, token, ETag (304), Retry-After (503).
import { authHeaders } from "../electoral/auth.js";

export interface HttpError extends Error {
  status: number;
  retryAfterMs?: number;
}

export function apiBase(): string {
  const v = (import.meta as unknown as { env?: Record<string, string> }).env?.["VITE_API_URL"];
  return (v ?? "http://localhost:3000").replace(/\/$/, "");
}

/** GET con soporte ETag: devuelve { notModified: true } ante 304. */
export async function httpGet<T>(
  path: string,
  opts: { token?: string; etag?: string } = {},
): Promise<{ data: T; etag?: string } | { notModified: true }> {
  const headers: Record<string, string> = {};
  if (opts.token !== undefined) Object.assign(headers, authHeaders(opts.token));
  if (opts.etag !== undefined) headers["If-None-Match"] = opts.etag;
  const res = await fetch(`${apiBase()}${path}`, { headers });
  if (res.status === 304) return { notModified: true };
  if (res.status === 503) {
    const e = new Error("Servicio no disponible") as HttpError;
    e.status = 503;
    const ra = res.headers.get("Retry-After");
    if (ra !== null) {
      const s = Number(ra);
      if (!Number.isNaN(s)) e.retryAfterMs = s * 1000;
    }
    throw e;
  }
  if (!res.ok) {
    const e = new Error(`HTTP ${res.status}`) as HttpError;
    e.status = res.status;
    throw e;
  }
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
  if (!res.ok) {
    const e = new Error(`HTTP ${res.status}`) as HttpError;
    e.status = res.status;
    throw e;
  }
  return (await res.json()) as T;
}
