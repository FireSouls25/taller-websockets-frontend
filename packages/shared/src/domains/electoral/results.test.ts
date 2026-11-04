import { describe, expect, it } from "vitest";
import {
  applyDelta,
  applySnapshot,
  fromWireDelta,
  fromWireSnapshot,
  initialState,
  requiresExplanation,
  type ResultsSnapshot,
} from "./results.js";

function snap(seq: number): ResultsSnapshot {
  return fromWireSnapshot({
    seq,
    topic: "mun:11",
    ts: 1_000 + seq,
    votos: { C1: 100, C2: 50 },
    sufragantes: 150,
    informadas: 10,
    total: 100,
    pct: 10,
    rank: [["C1", 100]],
  });
}

describe("results: snapshot replaces, delta merges", () => {
  it("snapshot replaces all local state", () => {
    const s = applySnapshot(initialState(), snap(5));
    expect(s.seq).toBe(5);
    expect(s.snapshot?.votes).toEqual({ C1: 100, C2: 50 });
  });

  it("delta merges votes by key with absolute values", () => {
    const s = applySnapshot(initialState(), snap(5));
    const r = applyDelta(s, fromWireDelta({ seq: 6, topic: "mun:11", ts: 2_000, votos: { C1: 120 } }));
    expect(r.action).toBe("applied");
    if (r.action === "applied") {
      expect(r.state.snapshot?.votes).toEqual({ C1: 120, C2: 50 });
    }
  });

  it("ignores duplicate or stale deltas", () => {
    const s = applySnapshot(initialState(), snap(6));
    expect(applyDelta(s, fromWireDelta({ seq: 6, topic: "mun:11", ts: 1 })).action).toBe(
      "ignored-duplicate",
    );
    expect(applyDelta(s, fromWireDelta({ seq: 4, topic: "mun:11", ts: 1 })).action).toBe(
      "ignored-duplicate",
    );
  });

  it("detects a gap when seq > last + 1", () => {
    const s = applySnapshot(initialState(), snap(6));
    const r = applyDelta(s, fromWireDelta({ seq: 8, topic: "mun:11", ts: 1 }));
    expect(r.action).toBe("gap");
  });

  it("rollback or corrections require a visible explanation", () => {
    expect(requiresExplanation({ rollback: true })).toBe(true);
    expect(
      requiresExplanation({ corrections: [{ record: "E14-1", from: 1, to: 2, reason: "CORRECCION", timestamp: 1 }] }),
    ).toBe(true);
    expect(requiresExplanation({})).toBe(false);
  });
});
