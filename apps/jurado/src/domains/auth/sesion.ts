// Dominio auth (jurado): sesión con token del login REST.
import { httpPost, rolDeUsuario, type LoginRespuesta } from "@preconteo/shared";

const CLAVE = "jurado.sesion";

export interface Sesion {
  token: string;
  usuario: string;
}

export function leerSesion(): Sesion | null {
  try {
    const raw = localStorage.getItem(CLAVE);
    if (!raw) return null;
    const s = JSON.parse(raw) as Sesion;
    if (typeof s.token !== "string" || typeof s.usuario !== "string") return null;
    return s;
  } catch {
    return null;
  }
}

export async function iniciarSesion(usuario: string, clave: string): Promise<Sesion> {
  const r = await httpPost<LoginRespuesta, { usuario: string; clave: string }>("/api/auth/login", {
    usuario,
    clave,
  });
  if (rolDeUsuario(r.usuario) !== "jurado") {
    throw new Error(`La cuenta ${r.usuario} no es de jurado`);
  }
  const s: Sesion = { token: r.token, usuario: r.usuario };
  localStorage.setItem(CLAVE, JSON.stringify(s));
  return s;
}

export function cerrarSesion(): void {
  localStorage.removeItem(CLAVE);
}
