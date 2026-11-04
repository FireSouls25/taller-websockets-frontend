// Domain: verification console (screen 3, console WS).
// Wire format (API contract) uses Spanish keys and must not be renamed.
//
// `rev` is a "ms-seq" text (Redis stream id), NOT a consecutive counter:
// gaps cannot be detected with it. Drop an event whose rev is at or below
// the last snapshot rev, comparing ms numerically, then seq.

export interface ReviewQueueItem {
  code: string;
  version: number;
  reason: string; // REGLA_CONTABLE | CONFLICTO_VERSION | ...
  priority: number;
  table: number;
  station: number;
  municipality: number;
  receivedAt: number;
}

export interface AssignedCase {
  record: string;
  auditor: string;
  since: number;
}

export interface CaseDetail {
  reason: string;
  votes: Record<string, number>;
  voters: number;
  version: number;
}

export interface MyCase {
  record: string;
  detail: CaseDetail;
  since?: number;
}

export interface ConsoleSnapshot {
  kind: "snapshot";
  rev: string;
  queueTotal: number;
  queue: ReviewQueueItem[];
  cases: AssignedCase[];
  myCase?: MyCase;
}

export type ConsoleEventType = "opened" | "taken" | "released" | "expired" | "withdrawn" | "resolved";

export interface ConsoleEvent {
  kind: "event";
  rev: string;
  type: ConsoleEventType;
  record: string;
  auditor?: string;
}

export type LostCaseReason = "idle" | "expired" | "new-version";

export type ConsoleErrorCode =
  | "NO_DISPONIBLE"
  | "YA_TIENE_CASO"
  | "COLA_VACIA"
  | "BLOQUEO_PERDIDO"
  | "VERSION_CAMBIO"
  | "SIN_CASO"
  | "DATOS_INVALIDOS"
  | "NO_AUTORIZADO"
  | "LIMITE_TASA"
  | "SERVICIO_NO_DISPONIBLE";

/** `resuelto` outcome: CONTADA or RECHAZADA. */
export type ResolvedOutcome = "CONTADA" | "RECHAZADA";

export interface PresenceInfo {
  instance: string;
  role: string;
  connectedSince: number;
  lastActivity: number;
}

export interface AuditorPresence {
  auditor: string;
  info: PresenceInfo;
  record?: string;
  since?: number;
}

// --- wire format (contract) ---

interface ReviewQueueItemWire {
  acta: string;
  version: number;
  motivo: string;
  prioridad: number;
  mesa: number;
  puesto: number;
  municipio: number;
  recibida: number;
}

interface AssignedCaseWire {
  acta: string;
  auditor: string;
  desde: number;
}

interface CaseDetailWire {
  motivo: string;
  votos: Record<string, number>;
  sufragantes: number;
  version: number;
}

interface ConsoleSnapshotWire {
  t: "snapshot";
  rev: string;
  total_cola: number;
  cola: ReviewQueueItemWire[];
  casos: AssignedCaseWire[];
  mi_caso?: { acta: string; desde: number; detalle: CaseDetailWire };
}

interface PresenceInfoWire {
  instancia: string;
  rol: string;
  conectado_desde: number;
  ultima_actividad: number;
}

interface AuditorPresenceWire {
  auditor: string;
  info: PresenceInfoWire;
  acta?: string;
  desde?: number;
}

const eventTypes: Record<string, ConsoleEventType> = {
  nueva: "opened",
  tomado: "taken",
  liberado: "released",
  expirado: "expired",
  retirada: "withdrawn",
  resuelto: "resolved",
};

const lostReasons: Record<string, LostCaseReason> = {
  INACTIVIDAD: "idle",
  EXPIRADO: "expired",
  NUEVA_VERSION: "new-version",
};

/** Compares "ms-seq" revs numerically: ms first, then seq. */
export function compareRev(a: string, b: string): number {
  const [aMs = "0", aSeq = "0"] = a.split("-");
  const [bMs = "0", bSeq = "0"] = b.split("-");
  if (Number(aMs) !== Number(bMs)) return Number(aMs) - Number(bMs);
  return Number(aSeq) - Number(bSeq);
}

/** Drop events at or below the last snapshot rev. */
export function isStaleEvent(snapshotRev: string, eventRev: string): boolean {
  return compareRev(eventRev, snapshotRev) <= 0;
}

export function fromWireQueueItem(w: ReviewQueueItemWire): ReviewQueueItem {
  return {
    code: w.acta,
    version: w.version,
    reason: w.motivo,
    priority: w.prioridad,
    table: w.mesa,
    station: w.puesto,
    municipality: w.municipio,
    receivedAt: w.recibida,
  };
}

export function fromWireCaseDetail(w: CaseDetailWire): CaseDetail {
  return { reason: w.motivo, votes: w.votos, voters: w.sufragantes, version: w.version };
}

export function fromWireConsoleSnapshot(w: ConsoleSnapshotWire): ConsoleSnapshot {
  return {
    kind: "snapshot",
    rev: w.rev,
    queueTotal: w.total_cola,
    queue: w.cola.map(fromWireQueueItem),
    cases: w.casos.map((c) => ({ record: c.acta, auditor: c.auditor, since: c.desde })),
    ...(w.mi_caso !== undefined
      ? {
          myCase: {
            record: w.mi_caso.acta,
            since: w.mi_caso.desde,
            detail: fromWireCaseDetail(w.mi_caso.detalle),
          },
        }
      : {}),
  };
}

export function fromWireEventType(t: string): ConsoleEventType {
  const mapped = eventTypes[t];
  if (!mapped) throw new Error(`unknown console event type: ${t}`);
  return mapped;
}

export function fromWireLostReason(m: string): LostCaseReason {
  const mapped = lostReasons[m];
  if (!mapped) throw new Error(`unknown lost-case reason: ${m}`);
  return mapped;
}

export function fromWirePresence(w: AuditorPresenceWire): AuditorPresence {
  return {
    auditor: w.auditor,
    info: {
      instance: w.info.instancia,
      role: w.info.rol,
      connectedSince: w.info.conectado_desde,
      lastActivity: w.info.ultima_actividad,
    },
    ...(w.acta !== undefined ? { record: w.acta } : {}),
    ...(w.desde !== undefined ? { since: w.desde } : {}),
  };
}

/** NO_DISPONIBLE is a normal race between auditors, not a failure. */
export function isNormalRace(code: ConsoleErrorCode): boolean {
  return code === "NO_DISPONIBLE";
}
