import { describe, expect, it } from "vitest";
import {
  compareRev,
  fromWireConsoleSnapshot,
  fromWirePresence,
  isNormalRace,
  isStaleEvent,
} from "./verification.js";

describe("verification: text revs and exclusivity", () => {
  it("compares ms-seq revs numerically", () => {
    expect(compareRev("100-1", "100-2")).toBeLessThan(0);
    expect(compareRev("100-2", "99-9")).toBeGreaterThan(0);
    expect(compareRev("100-2", "100-2")).toBe(0);
  });

  it("drops events at or below the snapshot rev", () => {
    expect(isStaleEvent("100-2", "100-2")).toBe(true);
    expect(isStaleEvent("100-2", "100-1")).toBe(true);
    expect(isStaleEvent("100-2", "100-3")).toBe(false);
  });

  it("NO_DISPONIBLE is a normal race, not a failure", () => {
    expect(isNormalRace("NO_DISPONIBLE")).toBe(true);
    expect(isNormalRace("SIN_CASO")).toBe(false);
  });

  it("maps the wire snapshot to the English model", () => {
    const s = fromWireConsoleSnapshot({
      t: "snapshot",
      rev: "100-2",
      total_cola: 1,
      cola: [
        { acta: "E14-1", version: 1, motivo: "REGLA_CONTABLE", prioridad: 9, mesa: 1, puesto: 1, municipio: 1, recibida: 7 },
      ],
      casos: [{ acta: "E14-2", auditor: "AUD-1", desde: 8 }],
      mi_caso: {
        acta: "E14-2",
        desde: 9,
        detalle: { motivo: "REGLA_CONTABLE", votos: { C1: 1 }, sufragantes: 1, version: 1 },
      },
    });
    expect(s.rev).toBe("100-2");
    expect(s.queueTotal).toBe(1);
    expect(s.queue[0]).toMatchObject({ code: "E14-1", table: 1, receivedAt: 7 });
    expect(s.cases[0]).toMatchObject({ record: "E14-2", since: 8 });
    expect(s.myCase).toMatchObject({ record: "E14-2", since: 9 });
  });

  it("maps presence info objects", () => {
    const p = fromWirePresence({
      auditor: "AUD-1",
      info: { instancia: "i-1", rol: "auditor", conectado_desde: 10, ultima_actividad: 20 },
      acta: "E14-2",
      desde: 30,
    });
    expect(p.info).toMatchObject({ instance: "i-1", role: "auditor", connectedSince: 10, lastActivity: 20 });
    expect(p.record).toBe("E14-2");
  });
});
