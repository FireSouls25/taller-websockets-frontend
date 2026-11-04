// Spanish UI copy for the verification console.
import type { ResolvedOutcome } from "@preconteo/shared";

export function resolvedText(record: string, outcome: ResolvedOutcome): string {
  return outcome === "CONTADA" ? `${record}: contada` : `${record}: rechazada por auditoría`;
}

export const es = {
  brand: "Verificación",
  signIn: {
    title: "Ingreso de auditoría",
    sub: "Cuentas AUD- o COORD-.",
    user: "Usuario",
    password: "Clave",
    action: "Ingresar",
    notAuditor: (user: string): string => `La cuenta ${user} no es de auditoría`,
    badCredentials: "Credenciales inválidas.",
    rateLimited: "Demasiados intentos, espera unos segundos.",
    failed: "No se pudo ingresar",
  },
  header: {
    signOut: "Salir",
    live: "en vivo",
    reconnecting: "reconectando…",
  },
  board: {
    title: "Cola de verificación",
    sub: (queue: number, rev: string): string => `${queue} en cola · rev ${rev}`,
    connecting: "Conectando…",
    rule: "un acta, un auditor.",
    queueTitle: (n: number): string => `Cola (${n})`,
    queueEmpty: "Cola vacía. Todo revisado.",
    take: "Tomar",
    takeUrgent: "Tomar la más urgente",
    takenBy: (auditor: string): string => `en ${auditor}`,
    free: "libre",
    myCase: "Mi caso",
    noCase: "Sin caso. Toma uno de la cola.",
    degraded: "Sistema degradado: trabaja con calma, los cambios pueden tardar.",
    offline: "Conexión perdida: tu caso se libera en 30 s si no vuelve.",
    idle: "Llevas 4 min sin actividad: el caso se libera al minuto siguiente.",
    raceLost: "Otro auditor tomó ese caso primero.",
    caseLost: (record: string, reason: string): string => `Perdiste ${record} (${reason}).`,
    lostIdle: "inactividad",
    lostExpired: "expirado",
    lostNewVersion: "nueva versión",
  },
  decision: {
    label: "Decisión",
    approve: "Aprobar",
    reject: "Rechazar",
    correct: "Corregir valores",
    resolve: "Resolver",
    release: "Liberar",
    mustBalance: "La corrección debe cuadrar: suma de votos igual a sufragantes.",
    voters: "Sufragantes",
  },
  history: {
    title: "Historial",
    loading: "cargando…",
    error: "No se pudo cargar el historial.",
    empty: "Sin eventos todavía.",
  },
  presence: {
    title: (n: number): string => `Presencia (${n})`,
    empty: "Nadie conectado.",
    noCase: "sin caso",
    working: (record: string, ago: string): string => `en ${record} desde hace ${ago}`,
    connected: (ago: string): string => `conectado hace ${ago}`,
    lastActivity: (ago: string): string => `actividad hace ${ago}`,
  },
};

export type Strings = typeof es;
