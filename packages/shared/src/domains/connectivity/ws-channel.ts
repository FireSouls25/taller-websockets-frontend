// WS channel with backoff + jitter reconnect and outbound queue.
// No server state: each connection/reconnect may land on another instance.

import { backoffDelay } from "./backoff.js";

export interface WsCallbacks {
  onMessage: (msg: unknown) => void;
  onStatus: (s: "connecting" | "open" | "reconnecting" | "degraded") => void;
}

export interface WsChannel {
  send: (msg: unknown) => void;
  close: () => void;
}

export function openWs(url: string, cb: WsCallbacks): WsChannel {
  let closed = false;
  let attempt = 0;
  let ws: WebSocket | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const pending: unknown[] = [];

  const connect = () => {
    if (closed) return;
    cb.onStatus("connecting");
    try {
      ws = new WebSocket(url);
    } catch {
      schedule();
      return;
    }
    ws.onopen = () => {
      attempt = 0;
      cb.onStatus("open");
      while (pending.length > 0) {
        const m = pending.shift();
        try {
          ws?.send(JSON.stringify(m));
        } catch {
          pending.unshift(m);
          break;
        }
      }
    };
    ws.onmessage = (ev) => {
      attempt = 0;
      cb.onMessage(JSON.parse(String(ev.data)) as unknown);
    };
    ws.onclose = () => {
      ws = null;
      if (!closed) schedule();
    };
    ws.onerror = () => {
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
    };
  };

  const schedule = () => {
    if (closed) return;
    cb.onStatus("reconnecting");
    const ms = backoffDelay(attempt);
    attempt += 1;
    timer = setTimeout(connect, ms);
  };

  connect();

  return {
    send(msg: unknown) {
      if (ws !== null && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
      else pending.push(msg);
    },
    close() {
      closed = true;
      if (timer !== null) clearTimeout(timer);
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
    },
  };
}
