// Canal SSE manual con fetch + ReadableStream (NO EventSource).
// RF-6/RF-10: lastEventId manual, backoff con jitter, respeto a Retry-After (503).
import { BACKOFF_MAX_MS, esperaBackoff } from "./backoff.js";
import { apiBase } from "./http.js";

export type SseEvento =
  | { tipo: "snapshot"; seq: number; payload: unknown }
  | { tipo: "delta"; seq: number; payload: unknown }
  | { tipo: "sistema"; payload: unknown }
  | { tipo: "reconectar"; payload: unknown };

export interface SseCallbacks {
  onEvento: (e: SseEvento) => void;
  onEstado: (s: "en-vivo" | "reconectando" | "pausa") => void;
}

export interface SseCanal {
  cerrar: () => void;
}

/**
 * Abre GET /api/public/stream?topic=..&lastEventId=... y reintenta con backoff.
 * `getLastEventId` permite retomar desde el último seq (continuidad RF-6).
 */
export function abrirStream(
  topic: string,
  getLastEventId: () => number | null,
  cb: SseCallbacks,
): SseCanal {
  let cerrado = false;
  let intento = 0;
  let lector: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const programar = (ms?: number) => {
    if (cerrado) return;
    cb.onEstado("reconectando");
    const espera = ms ?? esperaBackoff(intento);
    intento += 1;
    timer = setTimeout(conectar, Math.min(ms ?? espera, BACKOFF_MAX_MS) >= 0 ? espera : espera);
  };

  const conectar = async () => {
    if (cerrado) return;
    const last = getLastEventId();
    const url =
      `${apiBase()}/api/public/stream?topic=${encodeURIComponent(topic)}` +
      (last !== null ? `&lastEventId=${last}` : "");
    // Consulta previa para respetar Retry-After ante 503 sin abrir el stream.
    let head: Response;
    try {
      head = await fetch(url, { method: "GET", headers: { Accept: "text/event-stream" } });
    } catch {
      programar();
      return;
    }
    if (head.status === 503) {
      const ra = head.headers.get("Retry-After");
      const s = ra !== null ? Number(ra) : Number.NaN;
      programar(!Number.isNaN(s) ? s * 1000 : undefined);
      try {
        await head.body?.cancel();
      } catch {
        /* ignorar */
      }
      return;
    }
    if (!head.ok || head.body === null) {
      programar();
      return;
    }
    cb.onEstado("en-vivo");
    intento = 0;
    const dec = new TextDecoder();
    let buf = "";
    lector = head.body.getReader();
    try {
      for (;;) {
        const { done, value } = await lector.read();
        if (done || cerrado) break;
        buf += dec.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const bloque = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const ev = parseBloque(bloque);
          if (ev !== null) {
            intento = 0;
            cb.onEvento(ev);
          }
        }
      }
    } catch {
      /* corte de red: reintentar */
    } finally {
      lector = null;
    }
    if (!cerrado) programar();
  };

  void conectar();

  return {
    cerrar() {
      cerrado = true;
      if (timer !== null) clearTimeout(timer);
      void lector?.cancel().catch(() => undefined);
    },
  };
}

function parseBloque(bloque: string): SseEvento | null {
  let event = "";
  let data = "";
  for (const linea of bloque.split("\n")) {
    if (linea.startsWith("event:")) event = linea.slice(6).trim();
    else if (linea.startsWith("data:")) data += linea.slice(5).trim();
  }
  if (event === "" || data === "") return null;
  const payload: unknown = JSON.parse(data) as unknown;
  if (event === "snapshot" || event === "delta") {
    const seq = (payload as { seq?: unknown }).seq;
    if (typeof seq !== "number") return null;
    return { tipo: event, seq, payload };
  }
  if (event === "sistema") return { tipo: "sistema", payload };
  if (event === "reconectar") return { tipo: "reconectar", payload };
  return null;
}
