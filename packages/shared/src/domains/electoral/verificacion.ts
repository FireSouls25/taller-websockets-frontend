// Dominio: verificación (pantalla 3, WS consola).

export interface ColaItem {
  acta: string;
  version: number;
  motivo: string; // REGLA_CONTABLE | CONFLICTO_VERSION | ...
  prioridad: number;
  mesa: number;
  puesto: number;
  municipio: number;
  recibida: number;
}

export interface CasoAsignado {
  acta: string;
  auditor: string;
  desde: number;
}

export interface ConsolaSnapshot {
  t: "snapshot";
  rev: number;
  total_cola: number;
  cola: ColaItem[];
  casos: CasoAsignado[];
  mi_caso?: { acta: string; detalle: unknown };
}

export type ConsolaEventoTipo = "nueva" | "tomado" | "liberado" | "expirado" | "retirada" | "resuelto";

export interface ConsolaEvento {
  t: "evento";
  rev: number;
  tipo: ConsolaEventoTipo;
  acta: string;
  auditor?: string;
}

export type CasoPerdidoMotivo = "INACTIVIDAD" | "EXPIRADO" | "NUEVA_VERSION";

export type ConsolaErrorCodigo =
  | "NO_DISPONIBLE"
  | "YA_TIENE_CASO"
  | "COLA_VACIA"
  | "BLOQUEO_PERDIDO"
  | "VERSION_CAMBIO"
  | "SIN_CASO"
  | "DATOS_INVALIDOS"
  | "LIMITE_TASA"
  | "SERVICIO_NO_DISPONIBLE";

export interface PresenciaAuditor {
  auditor: string;
  info: string;
  acta?: string;
  desde?: number;
}

/** ¿El rev entrante exige pedir snapshot completo? */
export function necesitaSync(ultimoRev: number, revEntrante: number): boolean {
  return revEntrante > ultimoRev + 1;
}

/** NO_DISPONIBLE es carrera normal entre auditores, no un fallo. */
export function esCarreraNormal(codigo: ConsolaErrorCodigo): boolean {
  return codigo === "NO_DISPONIBLE";
}
