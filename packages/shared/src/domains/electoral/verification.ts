// Domain: verification console (screen 3, console WS).
// Wire format (API contract) uses Spanish keys and must not be renamed.

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
}

export interface ConsoleSnapshot {
  kind: "snapshot";
  rev: number;
  queueTotal: number;
  queue: ReviewQueueItem[];
  cases: AssignedCase[];
  myCase?: MyCase;
}

export type ConsoleEventType = "opened" | "taken" | "released" | "expired" | "withdrawn" | "resolved";

export interface ConsoleEvent {
  kind: "event";
  rev: number;
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
  | "LIMITE_TASA"
  | "SERVICIO_NO_DISPONIBLE";

export interface AuditorPresence {
  auditor: string;
  info: string;
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
  rev: number;
  total_cola: number;
  cola: ReviewQueueItemWire[];
  casos: AssignedCaseWire[];
  mi_caso?: { acta: string; detalle: CaseDetailWire };
}

interface AuditorPresenceWire {
  auditor: string;
  info: string;
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
    info: w.info,
    ...(w.acta !== undefined ? { record: w.acta } : {}),
    ...(w.desde !== undefined ? { since: w.desde } : {}),
  };
}

/** Does the incoming rev require a full snapshot? */
export function needsSync(lastRev: number, incomingRev: number): boolean {
  return incomingRev > lastRev + 1;
}

/** NO_DISPONIBLE is a normal race between auditors, not a failure. */
export function isNormalRace(code: ConsoleErrorCode): boolean {
  return code === "NO_DISPONIBLE";
}
