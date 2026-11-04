// Texto que ve el jurado por cada ack (contrato pantalla 2). Función pura.
import type { ActaAck } from "@preconteo/shared";

export function textoDeAck(ack: ActaAck): string {
  switch (ack.estado) {
    case "REGISTRADA":
      return ack.duplicado === true ? "Acta registrada (ya estaba registrada)" : "Acta registrada";
    case "EN_VERIFICACION":
      return "Recibida, en revisión por un auditor";
    case "OBSOLETA":
      return `Ya existe una versión más nueva (${String(ack.version_vigente ?? "?")})`;
    case "RECHAZADA":
      return `Rechazada (${ack.motivo ?? "sin motivo"}): revisa los datos y corrige`;
    case "RECHAZADA_EN_VERIFICACION":
      return "El auditor la rechazó";
    case "NO_REGISTRADA":
      return "Aún no registrada, reintentando";
  }
}
