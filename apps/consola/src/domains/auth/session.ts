// Console auth domain: auditors and coordination.
import { fromWireLogin, httpPost, roleOfUser } from "@preconteo/shared";
import { es } from "../../i18n/es.js";

const KEY = "consola.sesion";

export interface ConsoleSession {
  token: string;
  user: string;
  isCoordinator: boolean;
}

export function readSession(): ConsoleSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as ConsoleSession;
    if (typeof s.token !== "string" || typeof s.user !== "string") return null;
    return s;
  } catch {
    return null;
  }
}

export async function signIn(user: string, password: string): Promise<ConsoleSession> {
  const wire = await httpPost<{ token: string; rol: string; usuario: string }, { usuario: string; clave: string }>(
    "/api/auth/login",
    { usuario: user, clave: password },
  );
  const r = fromWireLogin(wire);
  const role = roleOfUser(r.user);
  if (role !== "auditor" && role !== "coordinator") {
    throw new Error(es.signIn.notAuditor(r.user));
  }
  const s: ConsoleSession = { token: r.token, user: r.user, isCoordinator: role === "coordinator" };
  localStorage.setItem(KEY, JSON.stringify(s));
  return s;
}

export function signOut(): void {
  localStorage.removeItem(KEY);
}
