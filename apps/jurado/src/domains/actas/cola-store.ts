// Dominio actas: cola offline en IndexedDB (RT-6).
// El acta se guarda ANTES de intentar enviarla; sobrevive a recarga y cierre.
import { openDB, type DBSchema } from "idb";
import type { Acta, ColaActaEstado } from "@preconteo/shared";

export interface RegistroCola {
  idem: string;
  acta: Acta;
  foto: Blob | null; // la subida aún no existe: se conserva local
  estado: ColaActaEstado;
  intentos: number;
  ultimoError?: string;
  actualizadaEn: number;
}

interface JuradoDB extends DBSchema {
  cola: { key: string; value: RegistroCola };
}

const db = openDB<JuradoDB>("jurado-preconteo", 1, {
  upgrade(d) {
    d.createObjectStore("cola", { keyPath: "idem" });
  },
});

export async function guardarEnCola(r: RegistroCola): Promise<void> {
  (await db).put("cola", r);
}

export async function listarCola(): Promise<RegistroCola[]> {
  const todas = await (await db).getAll("cola");
  return todas.sort((a, b) => a.actualizadaEn - b.actualizadaEn);
}

export async function quitarDeCola(idem: string): Promise<void> {
  await (await db).delete("cola", idem);
}

export async function marcarEstado(
  idem: string,
  parche: Partial<Pick<RegistroCola, "estado" | "intentos" | "ultimoError" | "actualizadaEn">>,
): Promise<void> {
  const t = await db;
  const actual = await t.get("cola", idem);
  if (!actual) return;
  await t.put("cola", { ...actual, ...parche, actualizadaEn: Date.now() });
}
