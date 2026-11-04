// Juror auth domain: REST login session.
import { fromWireLogin, httpPost, roleOfUser } from "@preconteo/shared";
import { es } from "../../i18n/es.js";

const KEY = "jurado.sesion";

export interface Session {
  token: string;
  user: string;
}

export function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    if (typeof s.token !== "string" || typeof s.user !== "string") return null;
    return s;
  } catch {
    return null;
  }
}

export async function signIn(user: string, password: string): Promise<Session> {
  const wire = await httpPost<{ token: string; rol: string; usuario: string }, { usuario: string; clave: string }>(
    "/api/auth/login",
    { usuario: user, clave: password },
  );
  const r = fromWireLogin(wire);
  if (roleOfUser(r.user) !== "juror") {
    throw new Error(es.signIn.notJuror(r.user));
  }
  const s: Session = { token: r.token, user: r.user };
  localStorage.setItem(KEY, JSON.stringify(s));
  return s;
}

export function signOut(): void {
  localStorage.removeItem(KEY);
}
