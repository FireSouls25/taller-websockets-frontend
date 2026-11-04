// Backoff exponencial con jitter completo (RF-10).
// espera = random(0, min(30000, 1000 * 2 ** intento)). Reiniciar intento al recibir evento.

export const BACKOFF_BASE_MS = 1000;
export const BACKOFF_MAX_MS = 30000;

export function esperaBackoff(intento: number, aleatorio: () => number = Math.random): number {
  const tope = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** intento);
  return aleatorio() * tope;
}

export interface BackoffEstado {
  intento: number;
}

/** Llama tras cada fallo; devuelve ms a esperar. */
export function siguienteBackoff(e: BackoffEstado, aleatorio?: () => number): number {
  const ms = esperaBackoff(e.intento, aleatorio);
  e.intento += 1;
  return ms;
}

/** Llama al recibir cualquier evento válido. */
export function reiniciarBackoff(e: BackoffEstado): void {
  e.intento = 0;
}
