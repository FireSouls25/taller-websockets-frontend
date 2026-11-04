import { describe, expect, it } from "vitest";
import { es, resolvedText } from "./es.js";

describe("console copy", () => {
  it("names the resolved outcome per contract", () => {
    expect(resolvedText("E14-1", "CONTADA")).toContain("contada");
    expect(resolvedText("E14-1", "RECHAZADA")).toContain("rechazada");
  });

  it("keeps every screen question answered", () => {
    expect(es.board.takeUrgent.length).toBeGreaterThan(0);
    expect(es.presence.title(3)).toContain("3");
  });
});
