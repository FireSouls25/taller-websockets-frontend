import { describe, expect, it } from "vitest";
import {
  expectedRecordCode,
  fromWireCatalog,
  fromWireTableDetail,
  isCoherentHierarchy,
  isValidTopic,
  municipalityOfStation,
  stationOfTable,
} from "./territory.js";

describe("territory: hierarchy mirrors the backend", () => {
  it("resolves the brief example: table 4201 -> station 176 -> municipality 11", () => {
    expect(stationOfTable(4201)).toBe(176);
    expect(municipalityOfStation(176)).toBe(11);
    expect(isCoherentHierarchy(4201, 176, 11)).toBe(true);
    expect(isCoherentHierarchy(4201, 177, 11)).toBe(false);
    expect(expectedRecordCode(4201)).toBe("E14-176-4201-03");
  });

  it("validates topics like the server", () => {
    expect(isValidTopic("dep")).toBe(true);
    expect(isValidTopic("mun:11")).toBe(true);
    expect(isValidTopic("mun:56")).toBe(false);
    expect(isValidTopic("puesto:1842")).toBe(true);
    expect(isValidTopic("puesto:1843")).toBe(false);
    expect(isValidTopic("otro:1")).toBe(false);
  });

  it("maps catalog and table detail", () => {
    const c = fromWireCatalog({ total_mesas: 6400, total_puestos: 1842, municipios: [{ id: 11, puestos: [176] }] });
    expect(c.municipalities[0]).toEqual({ id: 11, stations: [176] });
    const d = fromWireTableDetail({ mesa: 4201, informada: true, sufragantes: 627, votos: { C1: 1 } });
    expect(d).toMatchObject({ table: 4201, reported: true, voters: 627 });
  });
});
