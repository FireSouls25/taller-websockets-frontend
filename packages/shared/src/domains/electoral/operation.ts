// Domain: operations (screen 4, 2s polling).
// Wire format (API contract) uses Spanish keys and must not be renamed.

export interface InstanceMetrics {
  id: string;
  publicConnections: number;
  jurorConnections: number;
  consoleConnections: number;
  eventLoopP50: number;
  eventLoopP99: number;
  eventLoopMax: number;
  memoryPerConnection: number;
  messagesPerSecond: number;
  redis: string;
}

export interface GlobalMetrics {
  totalEmittedMessages: number;
  naiveEstimate: number;
  totalConnections: number;
  recordsPerMinute: number;
  publishLag: number;
}

export interface OperationMetrics {
  instances: InstanceMetrics[];
  global: GlobalMetrics;
}

// --- wire format (contract) ---

interface InstanceMetricsWire {
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

interface OperationMetricsWire {
  instancias: InstanceMetricsWire[];
  global: {
    mensajesEmitidosTotal: number;
    cifraIngenua: number;
    conexionesTotales: number;
    actasPorMinuto: number;
    retrasoPublicacion: number;
  };
}

export function fromWireMetrics(w: OperationMetricsWire): OperationMetrics {
  return {
    instances: w.instancias.map((i) => ({
      id: i.id,
      publicConnections: i.conexionesPublicas,
      jurorConnections: i.conexionesJurados,
      consoleConnections: i.conexionesConsolas,
      eventLoopP50: i.eventLoopP50,
      eventLoopP99: i.eventLoopP99,
      eventLoopMax: i.eventLoopMax,
      memoryPerConnection: i.memoriaPorConexion,
      messagesPerSecond: i.mensajesPorSegundo,
      redis: i.redis,
    })),
    global: {
      totalEmittedMessages: w.global.mensajesEmitidosTotal,
      naiveEstimate: w.global.cifraIngenua,
      totalConnections: w.global.conexionesTotales,
      recordsPerMinute: w.global.actasPorMinuto,
      publishLag: w.global.retrasoPublicacion,
    },
  };
}
