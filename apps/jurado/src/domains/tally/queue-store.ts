// Tally domain: offline queue in IndexedDB (RT-6).
// The sheet is stored BEFORE any send attempt; it survives reload and close.
import { openDB, type DBSchema } from "idb";
import type { PendingStatus, TallySheet } from "@preconteo/shared";

export interface PendingSubmission {
  idem: string;
  sheet: TallySheet;
  photo: Blob | null; // upload does not exist yet: kept locally
  status: PendingStatus;
  attempts: number;
  lastError?: string;
  updatedAt: number;
}

interface JurorDB extends DBSchema {
  queue: { key: string; value: PendingSubmission };
}

const db = openDB<JurorDB>("jurado-preconteo", 1, {
  upgrade(d) {
    d.createObjectStore("queue", { keyPath: "idem" });
  },
});

export async function saveSubmission(r: PendingSubmission): Promise<void> {
  (await db).put("queue", r);
}

export async function listQueue(): Promise<PendingSubmission[]> {
  const all = await (await db).getAll("queue");
  return all.sort((a, b) => a.updatedAt - b.updatedAt);
}

export async function removeFromQueue(idem: string): Promise<void> {
  await (await db).delete("queue", idem);
}

export async function updateStatus(
  idem: string,
  patch: Partial<Pick<PendingSubmission, "status" | "attempts" | "lastError" | "updatedAt">>,
): Promise<void> {
  const t = await db;
  const current = await t.get("queue", idem);
  if (!current) return;
  await t.put("queue", { ...current, ...patch, updatedAt: Date.now() });
}
