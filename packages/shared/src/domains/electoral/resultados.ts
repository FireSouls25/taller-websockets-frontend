// Dominio: resultados públicos (pantalla 1, SSE).
// Fuente: brief del taller. Si CONTRATO-API.md difiere, gana ese documento.

export type Topic = `mun:${number}` | `puesto:${number}` | "dep";

export type Votos = Record<string, number>; // C1, C2..., BLANCO, NULO, NO_MARCADO

export interface Correccion {
  acta: string;
  de: number;
  a: number;
  motivo: string; // CORRECCION | CONFLICTO_VERSION | otro
  ts: number;
}

export interface Snapshot {
  seq: number;
  topic: Topic;
  ts: number;
  votos: Votos;
  sufragantes: number;
  informadas: number;
  total: number;
  pct: number;
  rank: Array<[string, number]>;
  corr?: Correccion[];
}

export interface Delta {
  seq: number;
  topic: Topic;
  ts: number;
  votos?: Votos; // absolutos, solo claves que cambiaron: fusionar por clave
  sufragantes?: number;
  informadas?: number;
  pct?: number;
  rank?: Array<[string, number]>;
  corr?: Correccion[];
  retro?: boolean; // true => retroceso explicable, jamás silencioso
}

export interface SistemaMsg {
  degradado: boolean;
  desde?: number;
}

export interface ReconectarMsg {
  motivo: string;
}

/** Estado local por tópico. `snapshot` REEMPLAZA, `delta` fusiona. */
export interface TopicState {
  seq: number;
  data: Snapshot | null;
  degradado: boolean;
}

/** Resultado de intentar aplicar un delta. */
export type ApplyDeltaResult =
  | { accion: "aplicado"; state: TopicState }
  | { accion: "ignorado-duplicado"; state: TopicState }
  | { accion: "hueco"; state: TopicState; esperado: number; recibido: number };

export function estadoInicial(): TopicState {
  return { seq: -1, data: null, degradado: false };
}

/** Aplica snapshot: reemplazo total. */
export function aplicarSnapshot(_prev: TopicState, snap: Snapshot): TopicState {
  return { seq: snap.seq, data: snap, degradado: _prev.degradado };
}

/**
 * Fusiona un delta sobre el estado.
 * - seq <= ultimo => ignorar (duplicado o reordenado).
 * - seq > ultimo + 1 => hueco: el llamador debe cerrar y reconectar con lastEventId.
 * - valores del delta son ABSOLUTOS; `votos` se fusiona por clave.
 */
export function aplicarDelta(prev: TopicState, delta: Delta): ApplyDeltaResult {
  if (delta.seq <= prev.seq) {
    return { accion: "ignorado-duplicado", state: prev };
  }
  if (prev.data !== null && delta.seq > prev.seq + 1) {
    return { accion: "hueco", state: prev, esperado: prev.seq + 1, recibido: delta.seq };
  }
  if (prev.data === null) {
    // Sin snapshot base no se puede fusionar: tratar como hueco para forzar snapshot.
    return { accion: "hueco", state: prev, esperado: prev.seq + 1, recibido: delta.seq };
  }
  const base = prev.data;
  const corr = delta.corr ?? base.corr;
  const data: Snapshot = {
    seq: delta.seq,
    topic: delta.topic,
    ts: delta.ts,
    votos: delta.votos !== undefined ? { ...base.votos, ...delta.votos } : base.votos,
    sufragantes: delta.sufragantes ?? base.sufragantes,
    informadas: delta.informadas ?? base.informadas,
    total: base.total,
    pct: delta.pct ?? base.pct,
    rank: delta.rank ?? base.rank,
    ...(corr !== undefined ? { corr } : {}),
  };
  return { accion: "aplicado", state: { seq: delta.seq, data, degradado: prev.degradado } };
}

/** ¿Este delta/snapshot exige explicación visible? (RF: ningún retroceso silencioso) */
export function exigeExplicacion(d: { retro?: boolean; corr?: Correccion[] }): boolean {
  return d.retro === true || (d.corr !== undefined && d.corr.length > 0);
}
