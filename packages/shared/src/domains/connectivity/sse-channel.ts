// Manual SSE channel over fetch + ReadableStream (NO EventSource).
// RF-6/RF-10: manual lastEventId, backoff with jitter, Retry-After on 503.
import { backoffDelay } from "./backoff.js";
import { apiBase } from "./http.js";

// SSE `event:` names are wire format (contract); kinds mirror them.
export type SseEvent =
  | { kind: "snapshot"; seq: number; payload: unknown }
  | { kind: "delta"; seq: number; payload: unknown }
  | { kind: "sistema"; payload: unknown }
  | { kind: "reconectar"; payload: unknown };

export interface SseCallbacks {
  onEvent: (e: SseEvent) => void;
  onStatus: (s: "live" | "reconnecting" | "paused") => void;
}

export interface SseChannel {
  close: () => void;
}

/**
 * Opens GET /api/public/stream?topic=..&lastEventId=... and retries with backoff.
 * `getLastEventId` resumes from the last seq (RF-6 continuity).
 */
export function openStream(
  topic: string,
  getLastEventId: () => number | null,
  cb: SseCallbacks,
): SseChannel {
  let closed = false;
  let attempt = 0;
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const schedule = (ms?: number) => {
    if (closed) return;
    cb.onStatus("reconnecting");
    const wait = ms ?? backoffDelay(attempt);
    attempt += 1;
    timer = setTimeout(connect, wait);
  };

  const connect = async () => {
    if (closed) return;
    const last = getLastEventId();
    const url =
      `${apiBase()}/api/public/stream?topic=${encodeURIComponent(topic)}` +
      (last !== null ? `&lastEventId=${last}` : "");
    // Preflight check to honor Retry-After on 503 without opening the stream.
    let head: Response;
    try {
      head = await fetch(url, { method: "GET", headers: { Accept: "text/event-stream" } });
    } catch {
      schedule();
      return;
    }
    if (head.status === 503) {
      const ra = head.headers.get("Retry-After");
      const s = ra !== null ? Number(ra) : Number.NaN;
      schedule(!Number.isNaN(s) ? s * 1000 : undefined);
      try {
        await head.body?.cancel();
      } catch {
        /* ignore */
      }
      return;
    }
    if (!head.ok || head.body === null) {
      schedule();
      return;
    }
    cb.onStatus("live");
    attempt = 0;
    const dec = new TextDecoder();
    let buf = "";
    reader = head.body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done || closed) break;
        buf += dec.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const block = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const ev = parseBlock(block);
          if (ev !== null) {
            attempt = 0;
            cb.onEvent(ev);
          }
        }
      }
    } catch {
      /* network cut: retry */
    } finally {
      reader = null;
    }
    if (!closed) schedule();
  };

  void connect();

  return {
    close() {
      closed = true;
      if (timer !== null) clearTimeout(timer);
      void reader?.cancel().catch(() => undefined);
    },
  };
}

function parseBlock(block: string): SseEvent | null {
  let event = "";
  let data = "";
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data += line.slice(5).trim();
  }
  if (event === "" || data === "") return null;
  const payload: unknown = JSON.parse(data) as unknown;
  if (event === "snapshot" || event === "delta") {
    const seq = (payload as { seq?: unknown }).seq;
    if (typeof seq !== "number") return null;
    return { kind: event, seq, payload };
  }
  if (event === "sistema") return { kind: "sistema", payload };
  if (event === "reconectar") return { kind: "reconectar", payload };
  return null;
}
