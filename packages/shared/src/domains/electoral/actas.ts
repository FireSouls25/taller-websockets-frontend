// Dominio: actas del jurado (pantalla 2, WS + POST respaldo + offline).

export interface Acta {
  acta: string; // E14-176-0042-03
  mesa: number;
  puesto: number;
  municipio: number;
  version: number;
  jurado: string; // debe coincidir con usuario del token
  ts_cierre: number;
  votos: Record<string, number>;
  sufragantes: number;
  hash_foto: string; // sha256 hex de la foto
  idem: string; // clave única del envío; UNA por envío, se reutiliza en reintentos
}

export type ActaEstadoAck =
  | "REGISTRADA"
  | "EN_VERIFICACION"
  | "OBSOLETA"
  | "RECHAZADA"
  | "RECHAZADA_EN_VERIFICACION"
  | "NO_REGISTRADA";

export interface ActaAck {
  t: "ack";
  acta: string;
  version: number;
  idem: string;
  estado: ActaEstadoAck;
  motivo?: string; // ESQUEMA | JURADO_NO_COINCIDE | MESA_CON_OTRA_ACTA | IDEM_REUTILIZADA
  duplicado?: boolean;
  version_vigente?: number;
  estado_vigente?: string;
  reintentable?: boolean;
  reintentar_en?: number;
  ts: number;
}

/** Un ack es definitivo (saca de la cola) salvo NO_REGISTRADA reintentable. */
export function esAckDefinitivo(ack: ActaAck): boolean {
  if (ack.estado === "NO_REGISTRADA" && ack.reintentable === true) return false;
  return true;
}

export type ColaActaEstado =
  | "guardada"
  | "enviando"
  | "registrada"
  | "en-revision"
  | "rechazada";

export interface ColaActa {
  acta: Acta;
  estado: ColaActaEstado;
  intentos: number;
  ultimoError?: string;
  actualizadaEn: number;
}

/** Regla contable: suma(votos) === sufragantes. Advierte pero permite enviar. */
export function cumpleReglaContable(votos: Record<string, number>, sufragantes: number): boolean {
  let suma = 0;
  for (const v of Object.values(votos)) suma += v;
  return suma === sufragantes;
}

/** Saca de cola solo con ack definitivo. Sin ack no hay confirmación. */
export function debeQuitarDeCola(ack: ActaAck): boolean {
  return esAckDefinitivo(ack);
}
