// Domain: public results (screen 1, SSE).
// Wire format (API contract) uses Spanish keys and must not be renamed;
// the English model below maps to it at the boundary.

export type Topic = `mun:${number}` | `puesto:${number}` | "dep";

export type Votes = Record<string, number>; // C1, C2..., BLANCO, NULO, NO_MARCADO

export interface Correction {
  record: string;
  from: number;
  to: number;
  reason: string; // CORRECCION | CONFLICTO_VERSION | other
  timestamp: number;
}

export interface ResultsSnapshot {
  seq: number;
  topic: Topic;
  timestamp: number;
  votes: Votes;
  voters: number;
  reported: number;
  total: number;
  percent: number;
  rank: Array<[string, number]>;
  corrections?: Correction[];
}

export interface ResultsDelta {
  seq: number;
  topic: Topic;
  timestamp: number;
  votes?: Votes; // absolute values, only changed keys: merge by key
  voters?: number;
  reported?: number;
  percent?: number;
  rank?: Array<[string, number]>;
  corrections?: Correction[];
  rollback?: boolean; // true => explained rollback, never silent
}

export interface DegradedMessage {
  degraded: boolean;
  since?: number;
}

export interface ReconnectMessage {
  reason: string;
}

// --- wire format (contract) ---

interface CorrectionWire {
  acta: string;
  de: number;
  a: number;
  motivo: string;
  ts: number;
}

interface SnapshotWire {
  seq: number;
  topic: Topic;
  ts: number;
  votos: Votes;
  sufragantes: number;
  informadas: number;
  total: number;
  pct: number;
  rank: Array<[string, number]>;
  corr?: CorrectionWire[];
}

interface DeltaWire {
  seq: number;
  topic: Topic;
  ts: number;
  votos?: Votes;
  sufragantes?: number;
  informadas?: number;
  pct?: number;
  rank?: Array<[string, number]>;
  corr?: CorrectionWire[];
  retro?: boolean;
}

export function fromWireCorrection(c: CorrectionWire): Correction {
  return { record: c.acta, from: c.de, to: c.a, reason: c.motivo, timestamp: c.ts };
}

export function fromWireSnapshot(w: SnapshotWire): ResultsSnapshot {
  return {
    seq: w.seq,
    topic: w.topic,
    timestamp: w.ts,
    votes: w.votos,
    voters: w.sufragantes,
    reported: w.informadas,
    total: w.total,
    percent: w.pct,
    rank: w.rank,
    ...(w.corr !== undefined ? { corrections: w.corr.map(fromWireCorrection) } : {}),
  };
}

export function fromWireDelta(w: DeltaWire): ResultsDelta {
  return {
    seq: w.seq,
    topic: w.topic,
    timestamp: w.ts,
    ...(w.votos !== undefined ? { votes: w.votos } : {}),
    ...(w.sufragantes !== undefined ? { voters: w.sufragantes } : {}),
    ...(w.informadas !== undefined ? { reported: w.informadas } : {}),
    ...(w.pct !== undefined ? { percent: w.pct } : {}),
    ...(w.rank !== undefined ? { rank: w.rank } : {}),
    ...(w.corr !== undefined ? { corrections: w.corr.map(fromWireCorrection) } : {}),
    ...(w.retro !== undefined ? { rollback: w.retro } : {}),
  };
}

/** Local state per topic. `snapshot` REPLACES, `delta` merges. */
export interface TopicState {
  seq: number;
  snapshot: ResultsSnapshot | null;
  degraded: boolean;
}

/** Outcome of applying a delta. */
export type ApplyDeltaResult =
  | { action: "applied"; state: TopicState }
  | { action: "ignored-duplicate"; state: TopicState }
  | { action: "gap"; state: TopicState; expected: number; received: number };

export function initialState(): TopicState {
  return { seq: -1, snapshot: null, degraded: false };
}

/** Applies a snapshot: full replacement. */
export function applySnapshot(_prev: TopicState, snapshot: ResultsSnapshot): TopicState {
  return { seq: snapshot.seq, snapshot, degraded: _prev.degraded };
}

/**
 * Merges a delta into the state.
 * - seq <= last => ignore (duplicate or reordered).
 * - seq > last + 1 => gap: caller must close and reconnect with lastEventId.
 * - delta values are ABSOLUTE; `votes` merges by key.
 */
export function applyDelta(prev: TopicState, delta: ResultsDelta): ApplyDeltaResult {
  if (delta.seq <= prev.seq) {
    return { action: "ignored-duplicate", state: prev };
  }
  if (prev.snapshot !== null && delta.seq > prev.seq + 1) {
    return { action: "gap", state: prev, expected: prev.seq + 1, received: delta.seq };
  }
  if (prev.snapshot === null) {
    // No base snapshot to merge onto: treat as a gap to force a snapshot.
    return { action: "gap", state: prev, expected: prev.seq + 1, received: delta.seq };
  }
  const base = prev.snapshot;
  const corrections = delta.corrections ?? base.corrections;
  const snapshot: ResultsSnapshot = {
    seq: delta.seq,
    topic: delta.topic,
    timestamp: delta.timestamp,
    votes: delta.votes !== undefined ? { ...base.votes, ...delta.votes } : base.votes,
    voters: delta.voters ?? base.voters,
    reported: delta.reported ?? base.reported,
    total: base.total,
    percent: delta.percent ?? base.percent,
    rank: delta.rank ?? base.rank,
    ...(corrections !== undefined ? { corrections } : {}),
  };
  return { action: "applied", state: { seq: delta.seq, snapshot, degraded: prev.degraded } };
}

/** Does this delta/snapshot require a visible explanation? (no silent rollback) */
export function requiresExplanation(d: { rollback?: boolean; corrections?: Correction[] }): boolean {
  return d.rollback === true || (d.corrections !== undefined && d.corrections.length > 0);
}
