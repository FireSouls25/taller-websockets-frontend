import { httpGet } from "./http.js";

export async function obtenerInstancia(): Promise<string> {
  try {
    const r = await httpGet<{ instance: string }>("/api/instance");
    if ("notModified" in r) return "?";
    return r.data.instance;
  } catch {
    return "?";
  }
}
