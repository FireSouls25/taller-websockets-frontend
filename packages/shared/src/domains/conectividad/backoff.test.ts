import { describe, expect, it } from "vitest";
import { BACKOFF_MAX_MS, esperaBackoff, reiniciarBackoff, siguienteBackoff } from "./backoff.js";

describe("backoff con jitter completo (RF-10)", () => {
  it("crece exponencialmente y se acota a 30s", () => {
    expect(esperaBackoff(0, () => 1)).toBe(1000);
    expect(esperaBackoff(1, () => 1)).toBe(2000);
    expect(esperaBackoff(10, () => 1)).toBe(BACKOFF_MAX_MS);
    expect(esperaBackoff(0, () => 0)).toBe(0);
  });

  it("avanza intento y reinicia al recibir evento", () => {
    const e = { intento: 0 };
    siguienteBackoff(e, () => 1);
    expect(e.intento).toBe(1);
    reiniciarBackoff(e);
    expect(e.intento).toBe(0);
  });
});
