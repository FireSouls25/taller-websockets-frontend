// Domain: operations (screen 4, 2s polling).
// Wire format (API contract) uses Spanish keys and must not be renamed.
//
// With Redis down the endpoint answers 503 with
// `{ global: null, instancias: [<this instance only>] }`.

export interface InstanceConnections {
  public: number;
  jurors: number;
  consoles: number;
}

export interface EventLoopMs {
  p50: number;
  p99: number;
  max: number;
}

export interface InstanceMemory {
  rssMb: number;
  heapMb: number;
  kbPerConnection: number;
}

export interface InstanceMessages {
  emitted: number;
  perSecond: number;
  heartbeats: number;
  bytes: number;
}

export interface InstanceBackpressure {
  lagging: number;
  ejected: number;
  rejectedIntake: number;
}

export interface InstanceMetrics {
  id: string;
  timestamp: number;
  connections: InstanceConnections;
  eventLoopMs: EventLoopMs;
  memory: InstanceMemory;
  messages: InstanceMessages;
  backpressure: InstanceBackpressure;
  recordsPerMinute: number;
  publishLagMs: number;
  redisHealthy: boolean;
  postgresOk: boolean;
  savedAudits: number;
}

export interface GlobalMetrics {
  liveInstances: number;
  publicConnections: number;
  totalEmitted: number;
  naiveEstimate: number;
  reductionFactor: number;
  recordsPerMinute: number;
  publishLagMs: number;
}

export interface OperationMetrics {
  instances: InstanceMetrics[];
  global: GlobalMetrics | null; // null while Redis is down (RF-10)
}

// --- wire format (contract) ---

interface InstanceMetricsWire {
  instancia: string;
  ts: number;
  conexiones: { publicas: number; jurados: number; consolas: number };
  event_loop_ms: { p50: number; p99: number; max: number };
  memoria: { rss_mb: number; heap_mb: number; kb_por_conexion: number };
  mensajes: { emitidos: number; por_segundo: number; latidos: number; bytes: number };
  contrapresion: { rezagos: number; expulsadas: number; admision_rechazadas: number };
  actas_por_minuto: number;
  retraso_publicacion_ms: number;
  redis_saludable: boolean;
  postgres_ok: boolean;
  auditoria_guardados: number;
}

interface OperationMetricsWire {
  instancias: InstanceMetricsWire[];
  global: {
    instancias_vivas: number;
    conexiones_publicas: number;
    mensajes_emitidos: number;
    mensajes_ingenuos: number;
    reduccion_factor: number;
    actas_por_minuto: number;
    retraso_publicacion_ms: number;
  } | null;
}

export function fromWireMetrics(w: OperationMetricsWire): OperationMetrics {
  return {
    instances: w.instancias.map((i) => ({
      id: i.instancia,
      timestamp: i.ts,
      connections: { public: i.conexiones.publicas, jurors: i.conexiones.jurados, consoles: i.conexiones.consolas },
      eventLoopMs: { p50: i.event_loop_ms.p50, p99: i.event_loop_ms.p99, max: i.event_loop_ms.max },
      memory: { rssMb: i.memoria.rss_mb, heapMb: i.memoria.heap_mb, kbPerConnection: i.memoria.kb_por_conexion },
      messages: { emitted: i.mensajes.emitidos, perSecond: i.mensajes.por_segundo, heartbeats: i.mensajes.latidos, bytes: i.mensajes.bytes },
      backpressure: { lagging: i.contrapresion.rezagos, ejected: i.contrapresion.expulsadas, rejectedIntake: i.contrapresion.admision_rechazadas },
      recordsPerMinute: i.actas_por_minuto,
      publishLagMs: i.retraso_publicacion_ms,
      redisHealthy: i.redis_saludable,
      postgresOk: i.postgres_ok,
      savedAudits: i.auditoria_guardados,
    })),
    global:
      w.global === null
        ? null
        : {
            liveInstances: w.global.instancias_vivas,
            publicConnections: w.global.conexiones_publicas,
            totalEmitted: w.global.mensajes_emitidos,
            naiveEstimate: w.global.mensajes_ingenuos,
            reductionFactor: w.global.reduccion_factor,
            recordsPerMinute: w.global.actas_por_minuto,
            publishLagMs: w.global.retraso_publicacion_ms,
          },
  };
}
