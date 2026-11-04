import { describe, expect, it } from "vitest";
import {
  aplicarDelta,
  aplicarSnapshot,
  estadoInicial,
  exigeExplicacion,
  type Snapshot,
} from "./resultados.js";

function snap(seq: number): Snapshot {
  return {
    seq,
    topic: "mun:11",
    ts: 1_000 + seq,
    votos: { C1: 100, C2: 50 },
    sufragantes: 150,
    informadas: 10,
    total: 100,
    pct: 10,
    rank: [["C1", 100]],
  };
}

describe("resultados: snapshot reemplaza, delta fusiona", () => {
  it("snapshot reemplaza todo el estado local", () => {
    const s = aplicarSnapshot(estadoInicial(), snap(5));
    expect(s.seq).toBe(5);
    expect(s.data?.votos).toEqual({ C1: 100, C2: 50 });
  });

  it("delta fusiona votos por clave con valores absolutos", () => {
    let s = aplicarSnapshot(estadoInicial(), snap(5));
    const r = aplicarDelta(s, { seq: 6, topic: "mun:11", ts: 2_000, votos: { C1: 120 } });
    expect(r.accion).toBe("aplicado");
    if (r.accion === "aplicado") {
      expect(r.state.data?.votos).toEqual({ C1: 120, C2: 50 });
      s = r.state;
    }
  });

  it("ignora delta duplicado o viejo", () => {
    const s = aplicarSnapshot(estadoInicial(), snap(6));
    expect(aplicarDelta(s, { seq: 6, topic: "mun:11", ts: 1 }).accion).toBe("ignorado-duplicado");
    expect(aplicarDelta(s, { seq: 4, topic: "mun:11", ts: 1 }).accion).toBe("ignorado-duplicado");
  });

  it("detecta hueco cuando seq > ultimo + 1", () => {
    const s = aplicarSnapshot(estadoInicial(), snap(6));
    const r = aplicarDelta(s, { seq: 8, topic: "mun:11", ts: 1 });
    expect(r.accion).toBe("hueco");
  });

  it("retro o corr exigen explicación visible", () => {
    expect(exigeExplicacion({ retro: true })).toBe(true);
    expect(exigeExplicacion({ corr: [{ acta: "E14-1", de: 1, a: 2, motivo: "CORRECCION", ts: 1 }] })).toBe(true);
    expect(exigeExplicacion({})).toBe(false);
  });
});
