// Dominio: operación (pantalla 4, polling 2s).

export interface InstanciaMetrics {
  id: string;
  conexionesPublicas: number;
  conexionesJurados: number;
  conexionesConsolas: number;
  eventLoopP50: number;
  eventLoopP99: number;
  eventLoopMax: number;
  memoriaPorConexion: number;
  mensajesPorSegundo: number;
  redis: string;
}

export interface OpsGlobal {
  mensajesEmitidosTotal: number;
  cifraIngenua: number;
  conexionesTotales: number;
  actasPorMinuto: number;
  retrasoPublicacion: number;
}

export interface OpsMetrics {
  instancias: InstanciaMetrics[];
  global: OpsGlobal;
}
