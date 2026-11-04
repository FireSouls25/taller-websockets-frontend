// Dominio: auth (login REST + token en WS y REST).

export type Rol = "jurado" | "auditor" | "coordinador" | "publico";

export interface LoginRespuesta {
  token: string;
  rol: string;
  usuario: string;
}

/** El rol sale del prefijo: JUR- jurado, AUD- auditor, COORD- coordinador. */
export function rolDeUsuario(usuario: string): Rol {
  if (usuario.startsWith("JUR-")) return "jurado";
  if (usuario.startsWith("AUD-")) return "auditor";
  if (usuario.startsWith("COORD-")) return "coordinador";
  return "publico";
}

export function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

export function wsUrlConToken(base: string, path: "/ws/jurado" | "/ws/consola", token: string): string {
  const b = base.replace(/\/$/, "");
  return `${b}${path}?token=${encodeURIComponent(token)}`;
}
