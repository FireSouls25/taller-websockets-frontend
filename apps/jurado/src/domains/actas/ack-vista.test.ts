import { describe, expect, it } from "vitest";
import { textoDeAck } from "./ack-vista.js";
import type { ActaAck } from "@preconteo/shared";

const base: ActaAck = { t: "ack", acta: "E14-176-0042-03", version: 1, idem: "x", estado: "REGISTRADA", ts: 1 };

describe("ack-vista: el jurado siempre sabe si el acta quedó registrada", () => {
  it("cubre todos los estados del contrato", () => {
    expect(textoDeAck(base)).toBe("Acta registrada");
    expect(textoDeAck({ ...base, duplicado: true })).toContain("Acta registrada");
    expect(textoDeAck({ ...base, estado: "EN_VERIFICACION" })).toContain("revisión");
    expect(textoDeAck({ ...base, estado: "OBSOLETA", version_vigente: 2 })).toContain("2");
    expect(textoDeAck({ ...base, estado: "RECHAZADA", motivo: "ESQUEMA" })).toContain("ESQUEMA");
    expect(textoDeAck({ ...base, estado: "RECHAZADA_EN_VERIFICACION" })).toContain("auditor");
    expect(textoDeAck({ ...base, estado: "NO_REGISTRADA", reintentable: true })).toContain("reintentando");
  });
});
