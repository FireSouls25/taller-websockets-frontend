import { describe, expect, it } from "vitest";
import { ackText } from "./es.js";
import { fromWireAck } from "@preconteo/shared";

const wire = { t: "ack" as const, acta: "E14-176-0042-03", version: 1, idem: "x", ts: 1 };

describe("ack copy: the juror always knows whether the record landed", () => {
  it("covers every contract state", () => {
    expect(ackText(fromWireAck({ ...wire, estado: "REGISTRADA" }))).toBe("Acta registrada");
    expect(ackText(fromWireAck({ ...wire, estado: "REGISTRADA", duplicado: true }))).toContain("Acta registrada");
    expect(ackText(fromWireAck({ ...wire, estado: "EN_VERIFICACION" }))).toContain("revisión");
    expect(ackText(fromWireAck({ ...wire, estado: "OBSOLETA", version_vigente: 2 }))).toContain("2");
    expect(ackText(fromWireAck({ ...wire, estado: "RECHAZADA", motivo: "ESQUEMA" }))).toContain("ESQUEMA");
    expect(ackText(fromWireAck({ ...wire, estado: "RECHAZADA_EN_VERIFICACION" }))).toContain("auditor");
    expect(ackText(fromWireAck({ ...wire, estado: "NO_REGISTRADA", reintentable: true }))).toContain("reintentando");
  });
});
