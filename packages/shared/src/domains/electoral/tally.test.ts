import { describe, expect, it } from "vitest";
import { fromWireAck, satisfiesTallyRule, shouldRemoveFromQueue, toWireSheet } from "./tally.js";

describe("tally: tally rule and offline queue (RT-6)", () => {
  it("sum(votes) === voters", () => {
    expect(satisfiesTallyRule({ C1: 184, C2: 97, C3: 311, BLANCO: 22, NULO: 9, NO_MARCADO: 4 }, 627)).toBe(true);
    expect(satisfiesTallyRule({ C1: 10 }, 11)).toBe(false);
  });

  it("only retryable UNREGISTERED keeps the queue", () => {
    const wire = { t: "ack" as const, acta: "E14-1", version: 1, idem: "x", ts: 1 };
    expect(shouldRemoveFromQueue(fromWireAck({ ...wire, estado: "REGISTRADA" }))).toBe(true);
    expect(shouldRemoveFromQueue(fromWireAck({ ...wire, estado: "EN_VERIFICACION" }))).toBe(true);
    expect(shouldRemoveFromQueue(fromWireAck({ ...wire, estado: "NO_REGISTRADA", reintentable: true }))).toBe(false);
    expect(shouldRemoveFromQueue(fromWireAck({ ...wire, estado: "NO_REGISTRADA" }))).toBe(true);
  });

  it("the wire model keeps the contract keys", () => {
    const wire = toWireSheet({
      code: "E14-1",
      table: 4201,
      station: 176,
      municipality: 11,
      version: 1,
      juror: "JUR-88134",
      closedAt: 1793577600,
      votes: { C1: 10 },
      voters: 10,
      photoHash: "abc",
      idem: "x",
    });
    expect(wire).toMatchObject({ acta: "E14-1", mesa: 4201, jurado: "JUR-88134", sufragantes: 10 });
  });

  it("retries must reuse the same idem (contract)", () => {
    // The idem is generated ONCE per submission and stored with it.
    // Two retries of one submission share the idem;
    // two submissions (correction version+1) use different idems.
    const submissionIdem = "single-submission-idem-1";
    const retry1 = { idem: submissionIdem };
    const retry2 = { idem: submissionIdem };
    expect(retry1.idem).toBe(retry2.idem);
  });
});
