// Canal WS con reconexión por backoff + jitter y cola de salida.
// Sin estado de servidor: cada conexión/reconexión puede caer en otra instancia.

import { esperaBackoff } from "./backoff.js";

export interface WsCallbacks {
  onMensaje: (msg: unknown) => void;
  onEstado: (s: "conectando" | "abierto" | "reconectando" | "degradado") => void;
}

export interface WsCanal {
  enviar: (msg: unknown) => void;
  cerrar: () => void;
}

export function abrirWs(url: string, cb: WsCallbacks): WsCanal {
  let cerrado = false;
  let intento = 0;
  let ws: WebSocket | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const pendientes: unknown[] = [];

  const conectar = () => {
    if (cerrado) return;
    cb.onEstado("conectando");
    try {
      ws = new WebSocket(url);
    } catch {
      programar();
      return;
    }
    ws.onopen = () => {
      intento = 0;
      cb.onEstado("abierto");
      while (pendientes.length > 0) {
        const m = pendientes.shift();
        try {
          ws?.send(JSON.stringify(m));
        } catch {
          pendientes.unshift(m);
          break;
        }
      }
    };
    ws.onmessage = (ev) => {
      intento = 0;
      cb.onMensaje(JSON.parse(String(ev.data)) as unknown);
    };
    ws.onclose = () => {
      ws = null;
      if (!cerrado) programar();
    };
    ws.onerror = () => {
      try {
        ws?.close();
      } catch {
        /* ignorar */
      }
    };
  };

  const programar = () => {
    if (cerrado) return;
    cb.onEstado("reconectando");
    const ms = esperaBackoff(intento);
    intento += 1;
    timer = setTimeout(conectar, ms);
  };

  conectar();

  return {
    enviar(msg: unknown) {
      if (ws !== null && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
      else pendientes.push(msg);
    },
    cerrar() {
      cerrado = true;
      if (timer !== null) clearTimeout(timer);
      try {
        ws?.close();
      } catch {
        /* ignorar */
      }
    },
  };
}
