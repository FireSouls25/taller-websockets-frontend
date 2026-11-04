import { describe, expect, it } from "vitest";
import { esCarreraNormal, necesitaSync } from "./verificacion.js";

describe("verificacion: rev y exclusividad", () => {
  it("pide sync si rev > ultimo + 1", () => {
    expect(necesitaSync(10, 11)).toBe(false);
    expect(necesitaSync(10, 12)).toBe(true);
  });

  it("NO_DISPONIBLE es carrera normal, no fallo", () => {
    expect(esCarreraNormal("NO_DISPONIBLE")).toBe(true);
    expect(esCarreraNormal("SIN_CASO")).toBe(false);
  });
});
