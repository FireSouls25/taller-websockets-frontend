// Idem generation: ONCE per submission, reused across retries.
// Never regenerate on retry: that is the anti-double-count guarantee.

export function newIdem(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID !== undefined) return c.randomUUID();
  const b = new Uint8Array(16);
  c.getRandomValues(b);
  return Array.from(b)
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(d))
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
