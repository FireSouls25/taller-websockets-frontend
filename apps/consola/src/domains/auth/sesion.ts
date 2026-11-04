// Dominio auth (consola): auditores y coordinación.
import { httpPost, rolDeUsuario, type LoginRespuesta } from "@preconteo/shared";

const CLAVE = "consola.sesion";

export interface SesionConsola {
  token: string;
  usuario: string;
  esCoord: boolean;
}

export function leerSesion(): SesionConsola | null {
  try {
    const raw = localStorage.getItem(CLAVE);
    if (!raw) return null;
    const s = JSON.parse(raw) as SesionConsola;
    if (typeof s.token !== "string" || typeof s.usuario !== "string") return null;
    return s;
  } catch {
    return null;
  }
}

export async function iniciarSesion(usuario: string, clave: string): Promise<SesionConsola> {
  const r = await httpPost<LoginRespuesta, { usuario: string; clave: string }>("/api/auth/login", {
    usuario,
    clave,
  });
  const rol = rolDeUsuario(r.usuario);
  if (rol !== "auditor" && rol !== "coordinador") {
    throw new Error(`La cuenta ${r.usuario} no es de auditoría`);
  }
  const s: SesionConsola = { token: r.token, usuario: r.usuario, esCoord: rol === "coordinador" };
  localStorage.setItem(CLAVE, JSON.stringify(s));
  return s;
}

export function cerrarSesion(): void {
  localStorage.removeItem(CLAVE);
}
