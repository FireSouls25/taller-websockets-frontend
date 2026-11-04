// Spanish UI copy for the operations board.
export const es = {
  brand: "Operación",
  title: "Tablero de operación",
  live: "en vivo · 2 s",
  retrying: "reintentando",
  sub: (detail: string | null): string =>
    detail ?? "Prueba de carga y pico de la jornada. Métricas cada 2 segundos.",
  degraded: "Redis caído: solo se ve esta instancia. Los jurados reciben NO_REGISTRADA reintentable.",
  global: {
    title: "Global",
    liveInstances: "Instancias vivas",
    publicConnections: "Conexiones públicas",
    emitted: "Mensajes emitidos",
    naive: "Cifra ingenua",
    reduction: "Factor de reducción",
    recordsPerMinute: "Actas por minuto",
    publishLag: "Retraso publicación",
  },
  backpressure: {
    title: "Contrapresión por instancia",
    lagging: "rezagadas",
    ejected: "expulsadas",
    rejectedIntake: "admisión rechazada",
    redisDown: "redis caído",
    redisOk: "redis ok",
    postgresDown: "postgres caído",
    postgresOk: "postgres ok",
  },
  instances: {
    title: (n: number): string => `Por instancia (${n})`,
    waiting: "Esperando métricas…",
    instance: "Instancia",
    connections: "Conexiones (púb/jur/con)",
    eventLoop: "Event loop p50/p99/máx",
    memory: "Memoria RSS/heap/KB-conex",
    messages: "Mensajes emitidos/s",
    records: "Actas/min · retraso pub",
    audits: "Auditorías",
  },
  ms: (n: number): string => `${n} ms`,
};

export type Strings = typeof es;
