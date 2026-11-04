import { describe, expect, it } from "vitest";
import { fromWireMetrics } from "./operation.js";

describe("operation: real metrics shape", () => {
  it("maps instances, backpressure and null global while Redis is down", () => {
    const m = fromWireMetrics({
      instancias: [
        {
          instancia: "i-1",
          ts: 1,
          conexiones: { publicas: 10, jurados: 2, consolas: 1 },
          event_loop_ms: { p50: 4, p99: 18, max: 40 },
          memoria: { rss_mb: 100, heap_mb: 60, kb_por_conexion: 24 },
          mensajes: { emitidos: 50, por_segundo: 5, latidos: 1, bytes: 100 },
          contrapresion: { rezagos: 2, expulsadas: 1, admision_rechazadas: 0 },
          actas_por_minuto: 90,
          retraso_publicacion_ms: 1800,
          redis_saludable: false,
          postgres_ok: true,
          auditoria_guardados: 3,
        },
      ],
      global: null,
    });
    expect(m.global).toBeNull();
    expect(m.instances[0]).toMatchObject({
      id: "i-1",
      backpressure: { lagging: 2, ejected: 1, rejectedIntake: 0 },
      redisHealthy: false,
    });
  });
});
