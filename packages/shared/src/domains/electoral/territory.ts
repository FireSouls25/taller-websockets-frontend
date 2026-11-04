// Domain: territory catalog and polling-table detail.
// Hierarchy formulas mirror the backend (deterministic, per contract §Jurados)
// so the juror form can warn before a rejected trip.

export const TOTAL_TABLES = 6_400;
export const TOTAL_STATIONS = 1_842;
export const TOTAL_MUNICIPALITIES = 55;

export interface MunicipalityEntry {
  id: number;
  stations: number[];
}

export interface TerritorialCatalog {
  totalTables: number;
  totalStations: number;
  municipalities: MunicipalityEntry[];
}

export interface TableDetail {
  table: number;
  reported: boolean;
  voters: number;
  votes: Record<string, number>;
}

// --- wire format (contract) ---

export interface TerritorialCatalogWire {
  total_mesas: number;
  total_puestos: number;
  municipios: Array<{ id: number; puestos: number[] }>;
}

export interface TableDetailWire {
  mesa: number;
  informada: boolean;
  sufragantes: number;
  votos: Record<string, number>;
}

export function fromWireCatalog(w: TerritorialCatalogWire): TerritorialCatalog {
  return {
    totalTables: w.total_mesas,
    totalStations: w.total_puestos,
    municipalities: w.municipios.map((m) => ({ id: m.id, stations: m.puestos })),
  };
}

export function fromWireTableDetail(w: TableDetailWire): TableDetail {
  return { table: w.mesa, reported: w.informada, voters: w.sufragantes, votes: w.votos };
}

/** station = (table + 1501) mod 1842 (0 means 1842). */
export function stationOfTable(table: number): number {
  return (table + 1501) % TOTAL_STATIONS || TOTAL_STATIONS;
}

/** municipality = station mod 55 (0 means 55). */
export function municipalityOfStation(station: number): number {
  return station % TOTAL_MUNICIPALITIES || TOTAL_MUNICIPALITIES;
}

export function isCoherentHierarchy(table: number, station: number, municipality: number): boolean {
  return (
    Number.isInteger(table) &&
    table >= 1 &&
    table <= TOTAL_TABLES &&
    stationOfTable(table) === station &&
    municipalityOfStation(station) === municipality
  );
}

/** Expected record code for a table: E14-<station>-<table>-03. */
export function expectedRecordCode(table: number): string {
  const station = String(stationOfTable(table)).padStart(3, "0");
  return `E14-${station}-${String(table).padStart(4, "0")}-03`;
}

/** Client-side topic guard mirroring `topicoValido` (server answers 400 otherwise). */
export function isValidTopic(t: string): boolean {
  if (t === "dep") return true;
  const m = /^(mun|puesto):([1-9]\d{0,3})$/.exec(t);
  if (!m) return false;
  const id = Number(m[2]);
  return id <= (m[1] === "mun" ? TOTAL_MUNICIPALITIES : TOTAL_STATIONS);
}
