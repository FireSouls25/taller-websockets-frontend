// Spanish UI copy for the juror app.
import type { TallyAck } from "@preconteo/shared";

export function ackText(ack: TallyAck): string {
  switch (ack.status) {
    case "registered":
      return ack.duplicate === true ? "Acta registrada (ya estaba registrada)" : "Acta registrada";
    case "in-review":
      return "Recibida, en revisión por un auditor";
    case "obsolete":
      return `Ya existe una versión más nueva (${String(ack.currentVersion ?? "?")})`;
    case "rejected":
      return `Rechazada (${ack.reason ?? "sin motivo"}): revisa los datos y corrige`;
    case "rejected-in-review":
      return "El auditor la rechazó";
    case "unregistered":
      return "Aún no registrada, reintentando";
  }
}

export const es = {
  brand: "Jurado",
  signIn: {
    title: "Ingreso de jurado",
    sub: "Usa tu código JUR- y tu clave.",
    user: "Usuario",
    password: "Clave",
    action: "Ingresar",
    notJuror: (user: string): string => `La cuenta ${user} no es de jurado`,
    badCredentials: "Credenciales inválidas.",
    rateLimited: "Demasiados intentos, espera unos segundos.",
    failed: "No se pudo ingresar",
  },
  header: {
    signOut: "Salir",
    live: "en vivo",
    onHold: "en espera",
    reconnecting: "reconectando…",
  },
  intro: {
    title: "Transmitir acta",
    sub: (instance: string): string =>
      `El acta queda guardada en este teléfono antes de enviarse. Sin confirmación no hay registro: si se corta la red, se reintenta sola. Instancia ${instance}.`,
  },
  degradedNotice: "Red o sistema degradado: los envíos quedan en espera.",
  recordState: (record: string, state: string): string => `${record}: estado ${state}`,
  form: {
    title: "Acta",
    correctionBadge: (version: string): string => `corrección v${version}`,
    record: "Acta",
    recordPlaceholder: "E14-176-0042-03",
    version: "Versión",
    table: "Mesa",
    station: "Puesto",
    municipality: "Municipio",
    voters: "Sufragantes",
    votesTitle: "Votos",
    mismatch:
      "La suma de votos no coincide con sufragantes: el acta irá a verificación humana. Puedes enviarla igual.",
    territory:
      "Mesa, puesto y municipio no coinciden entre sí: el servidor la rechazará. Revisa los números.",
    codeMismatch: (expected: string): string =>
      `Para esa mesa el acta debería ser ${expected}. Revisa el código.`,
    photo: "Foto del acta",
    noPhoto: "sin-foto",
    photoHash: (hash: string): string => `sha256 ${hash.slice(0, 32)}… (se conserva en el teléfono)`,
    missing: "Faltan acta, mesa, puesto o municipio.",
    submit: "Guardar y enviar",
  },
  queue: {
    title: (count: number): string => `En este teléfono (${count})`,
    empty: "Sin actas pendientes. Todo lo enviado y confirmado sale de aquí.",
    status: {
      stored: "guardada localmente",
      sending: "enviando",
      sendingWithError: (error: string): string => `enviando · ${error}`,
      registered: "registrada",
      inReview: "en revisión",
    },
    attempts: (n: number): string => `intentos ${n}`,
    correct: "Corregir",
    query: "Estado",
    invalidSession: "Sesión inválida, ingresa de nuevo.",
  },
};

export type Strings = typeof es;
