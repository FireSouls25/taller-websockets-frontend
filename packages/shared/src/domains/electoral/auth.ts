// Domain: auth (REST login + token on WS and REST).
// Wire format (API contract) uses Spanish keys and must not be renamed.

export type Role = "juror" | "auditor" | "coordinator" | "public";

export interface LoginResponse {
  token: string;
  role: string;
  user: string;
}

interface LoginResponseWire {
  token: string;
  rol: string;
  usuario: string;
}

export function fromWireLogin(w: LoginResponseWire): LoginResponse {
  return { token: w.token, role: w.rol, user: w.usuario };
}

/** The role comes from the prefix: JUR- juror, AUD- auditor, COORD- coordinator. */
export function roleOfUser(user: string): Role {
  if (user.startsWith("JUR-")) return "juror";
  if (user.startsWith("AUD-")) return "auditor";
  if (user.startsWith("COORD-")) return "coordinator";
  return "public";
}

export function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

export function wsUrlWithToken(base: string, path: "/ws/jurado" | "/ws/consola", token: string): string {
  const b = base.replace(/\/$/, "");
  return `${b}${path}?token=${encodeURIComponent(token)}`;
}
