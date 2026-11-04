import { describe, expect, it } from "vitest";
import { fromWireConsoleSnapshot, isNormalRace, needsSync } from "./verification.js";

describe("verification: rev and exclusivity", () => {
  it("requests sync when rev > last + 1", () => {
    expect(needsSync(10, 11)).toBe(false);
    expect(needsSync(10, 12)).toBe(true);
  });

  it("NO_DISPONIBLE is a normal race, not a failure", () => {
    expect(isNormalRace("NO_DISPONIBLE")).toBe(true);
    expect(isNormalRace("SIN_CASO")).toBe(false);
  });

  it("maps the wire snapshot to the English model", () => {
    const s = fromWireConsoleSnapshot({
      t: "snapshot",
      rev: 41,
      total_cola: 1,
      cola: [
        { acta: "E14-1", version: 1, motivo: "REGLA_CONTABLE", prioridad: 9, mesa: 1, puesto: 1, municipio: 1, recibida: 7 },
      ],
      casos: [{ acta: "E14-2", auditor: "AUD-1", desde: 8 }],
    });
    expect(s.queueTotal).toBe(1);
    expect(s.queue[0]).toMatchObject({ code: "E14-1", table: 1, receivedAt: 7 });
    expect(s.cases[0]).toMatchObject({ record: "E14-2", since: 8 });
  });
});
