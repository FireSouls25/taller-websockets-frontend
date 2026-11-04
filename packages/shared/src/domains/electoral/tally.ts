// Domain: juror tally sheets (screen 2, WS + POST fallback + offline).
// Wire format (API contract) uses Spanish keys and must not be renamed.

export interface TallySheet {
  code: string; // E14-176-0042-03
  table: number;
  station: number;
  municipality: number;
  version: number;
  juror: string; // must match the token user
  closedAt: number;
  votes: Record<string, number>;
  voters: number;
  photoHash: string; // hex sha256 of the photo
  idem: string; // single key per submission, reused across retries
}

export type TallyAckStatus =
  | "registered"
  | "in-review"
  | "obsolete"
  | "rejected"
  | "rejected-in-review"
  | "unregistered";

export interface TallyAck {
  kind: "ack";
  code: string;
  version: number;
  idem: string;
  status: TallyAckStatus;
  reason?: string; // ESQUEMA | JURADO_NO_COINCIDE | MESA_CON_OTRA_ACTA | IDEM_REUTILIZADA
  duplicate?: boolean;
  currentVersion?: number;
  currentState?: string;
  retryable?: boolean;
  retryIn?: number;
  timestamp: number;
}

// --- wire format (contract) ---

export interface TallySheetWire {
  acta: string;
  mesa: number;
  puesto: number;
  municipio: number;
  version: number;
  jurado: string;
  ts_cierre: number;
  votos: Record<string, number>;
  sufragantes: number;
  hash_foto: string;
  idem: string;
}

export interface TallyAckWire {
  t: "ack";
  acta: string;
  version: number;
  idem: string;
  estado:
    | "REGISTRADA"
    | "EN_VERIFICACION"
    | "OBSOLETA"
    | "RECHAZADA"
    | "RECHAZADA_EN_VERIFICACION"
    | "NO_REGISTRADA";
  motivo?: string;
  duplicado?: boolean;
  version_vigente?: number;
  estado_vigente?: string;
  reintentable?: boolean;
  reintentar_en?: number;
  ts: number;
}

export function toWireSheet(s: TallySheet): TallySheetWire {
  return {
    acta: s.code,
    mesa: s.table,
    puesto: s.station,
    municipio: s.municipality,
    version: s.version,
    jurado: s.juror,
    ts_cierre: s.closedAt,
    votos: s.votes,
    sufragantes: s.voters,
    hash_foto: s.photoHash,
    idem: s.idem,
  };
}

export function fromWireAck(w: TallyAckWire): TallyAck {
  const status: Record<TallyAckWire["estado"], TallyAckStatus> = {
    REGISTRADA: "registered",
    EN_VERIFICACION: "in-review",
    OBSOLETA: "obsolete",
    RECHAZADA: "rejected",
    RECHAZADA_EN_VERIFICACION: "rejected-in-review",
    NO_REGISTRADA: "unregistered",
  };
  return {
    kind: "ack",
    code: w.acta,
    version: w.version,
    idem: w.idem,
    status: status[w.estado],
    ...(w.motivo !== undefined ? { reason: w.motivo } : {}),
    ...(w.duplicado !== undefined ? { duplicate: w.duplicado } : {}),
    ...(w.version_vigente !== undefined ? { currentVersion: w.version_vigente } : {}),
    ...(w.estado_vigente !== undefined ? { currentState: w.estado_vigente } : {}),
    ...(w.reintentable !== undefined ? { retryable: w.reintentable } : {}),
    ...(w.reintentar_en !== undefined ? { retryIn: w.reintentar_en } : {}),
    timestamp: w.ts,
  };
}

/** An ack is final (leaves the queue) except retryable UNREGISTERED. */
export function isFinalAck(ack: TallyAck): boolean {
  if (ack.status === "unregistered" && ack.retryable === true) return false;
  return true;
}

export type PendingStatus = "stored" | "sending" | "registered" | "in-review" | "rejected";

export interface PendingSubmission {
  idem: string;
  sheet: TallySheet;
  photo: Blob | null;
  status: PendingStatus;
  attempts: number;
  lastError?: string;
  updatedAt: number;
}

/** Tally rule: sum(votes) === voters. Warns but allows sending. */
export function satisfiesTallyRule(votes: Record<string, number>, voters: number): boolean {
  let sum = 0;
  for (const v of Object.values(votes)) sum += v;
  return sum === voters;
}

/** Remove from queue only on a final ack. Without ack there is no confirmation. */
export function shouldRemoveFromQueue(ack: TallyAck): boolean {
  return isFinalAck(ack);
}
