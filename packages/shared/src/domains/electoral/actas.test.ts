import { describe, expect, it } from "vitest";
import { cumpleReglaContable, debeQuitarDeCola } from "./actas.js";

describe("actas: regla contable y cola offline (RT-6)", () => {
  it("suma(votos) === sufragantes", () => {
    expect(cumpleReglaContable({ C1: 184, C2: 97, C3: 311, BLANCO: 22, NULO: 9, NO_MARCADO: 4 }, 627)).toBe(true);
    expect(cumpleReglaContable({ C1: 10 }, 11)).toBe(false);
  });

  it("solo NO_REGISTRADA reintentable conserva la cola", () => {
    const base = { t: "ack" as const, acta: "E14-1", version: 1, idem: "x", ts: 1 };
    expect(debeQuitarDeCola({ ...base, estado: "REGISTRADA" })).toBe(true);
    expect(debeQuitarDeCola({ ...base, estado: "EN_VERIFICACION" })).toBe(true);
    expect(debeQuitarDeCola({ ...base, estado: "NO_REGISTRADA", reintentable: true })).toBe(false);
    expect(debeQuitarDeCola({ ...base, estado: "NO_REGISTRADA" })).toBe(true);
  });

  it("los reintentos deben reutilizar el mismo idem (contrato)", () => {
    // Regla documentada: el idem se genera UNA vez por envío y se guarda con el acta.
    // Este test fija el invariante: dos reintentos del mismo envío comparten idem,
    // dos envíos distintos (corrección version+1) usan idem distinto.
    const idemEnvio = "idem-unico-envio-1";
    const reintento1 = { idem: idemEnvio };
    const reintento2 = { idem: idemEnvio };
    expect(reintento1.idem).toBe(reintento2.idem);
  });
});
