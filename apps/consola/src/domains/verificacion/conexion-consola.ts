// Conexión de consola: rev monótono, exclusividad del backend, presencia.
// Reglas: hueco de rev => sync; NO_DISPONIBLE es carrera normal;
// caso_perdido cierra el caso; inactividad 5 min / desconexión 30 s lo liberan.
import {
  abrirWs,
  apiBase,
  necesitaSync,
  type ColaItem,
  type CasoAsignado,
  type CasoPerdidoMotivo,
  type ConsolaErrorCodigo,
  type PresenciaAuditor,
  type WsCanal,
} from "@preconteo/shared";

export interface MiCaso {
  acta: string;
  detalle: { motivo: string; votos: Record<string, number>; sufragantes: number; version: number };
}

export interface EstadoConsola {
  conectada: boolean;
  degradado: boolean;
  rev: number;
  cola: ColaItem[];
  casos: CasoAsignado[];
  miCaso: MiCaso | null;
  presencia: PresenciaAuditor[];
  aviso: string | null;
  avisoInactividad: boolean;
}

export interface EventosConsola {
  onEstado: (e: EstadoConsola) => void;
}

function wsBase(): string {
  return apiBase().replace(/^http/, "ws");
}

const ACTIVIDAD_MS = 15_000;
const AVISO_INACTIVIDAD_MS = 4 * 60_000;

export class ConexionConsola {
  private canal: WsCanal | null = null;
  private st: EstadoConsola = {
    conectada: false,
    degradado: false,
    rev: 0,
    cola: [],
    casos: [],
    miCaso: null,
    presencia: [],
    aviso: null,
    avisoInactividad: false,
  };
  private ultimaActividad = 0;
  private ultimoEnvioActividad = 0;
  private timerInactividad: ReturnType<typeof setInterval> | null = null;

  constructor(
    private token: string,
    private ev: EventosConsola,
  ) {}

  arrancar(): void {
    this.canal = abrirWs(`${wsBase()}/ws/consola?token=${encodeURIComponent(this.token)}`, {
      onMensaje: (m) => this.alMensaje(m),
      onEstado: (s) => {
        this.st.conectada = s === "abierto";
        if (s !== "abierto") {
          this.st.aviso = "Conexión perdida: tu caso se libera en 30 s si no vuelve.";
        }
        this.emitir();
      },
    });
    const tocar = (): void => this.actividad();
    window.addEventListener("mousemove", tocar);
    window.addEventListener("keydown", tocar);
    window.addEventListener("touchstart", tocar);
    this.limpiar = () => {
      window.removeEventListener("mousemove", tocar);
      window.removeEventListener("keydown", tocar);
      window.removeEventListener("touchstart", tocar);
    };
    this.ultimaActividad = Date.now();
    this.timerInactividad = setInterval(() => {
      const quieto = Date.now() - this.ultimaActividad > AVISO_INACTIVIDAD_MS;
      if (quieto !== this.st.avisoInactividad) {
        this.st.avisoInactividad = quieto;
        if (quieto) this.st.aviso = "Llevas 4 min sin actividad: el caso se libera al minuto siguiente.";
        this.emitir();
      }
    }, 15_000);
  }

  private limpiar: () => void = () => undefined;

  detener(): void {
    this.limpiar();
    if (this.timerInactividad) clearInterval(this.timerInactividad);
    this.canal?.cerrar();
  }

  tomar(acta?: string): void {
    this.canal?.enviar(acta ? { t: "tomar", acta } : { t: "tomar" });
  }

  liberar(): void {
    this.canal?.enviar({ t: "liberar" });
  }

  resolver(decision: "APROBAR" | "RECHAZAR" | "CORREGIR", votos?: Record<string, number>, sufragantes?: number): void {
    if (decision === "CORREGIR") {
      this.canal?.enviar({ t: "resolver", decision, votos, sufragantes });
    } else {
      this.canal?.enviar({ t: "resolver", decision });
    }
  }

  private actividad(): void {
    this.ultimaActividad = Date.now();
    if (this.st.avisoInactividad) {
      this.st.avisoInactividad = false;
      this.st.aviso = null;
      this.emitir();
    }
    // Throttle: máximo uno cada 15 s.
    if (Date.now() - this.ultimoEnvioActividad < ACTIVIDAD_MS) return;
    this.ultimoEnvioActividad = Date.now();
    this.canal?.enviar({ t: "actividad" });
  }

  private alMensaje(m: unknown): void {
    const msg = m as { t?: string };
    switch (msg.t) {
      case "snapshot": {
        const s = m as { rev: number; total_cola: number; cola: ColaItem[]; casos: CasoAsignado[]; mi_caso?: MiCaso };
        this.st.rev = s.rev;
        this.st.cola = s.cola;
        this.st.casos = s.casos;
        if (s.mi_caso) this.st.miCaso = s.mi_caso; // recupero mi trabajo tras reconectar
        this.st.aviso = null;
        this.emitir();
        break;
      }
      case "evento": {
        const e = m as { rev: number; tipo: string; acta: string; auditor?: string };
        if (necesitaSync(this.st.rev, e.rev)) {
          this.canal?.enviar({ t: "sync" }); // hueco: pido la fotografía completa
        } else {
          this.st.rev = e.rev;
          this.canal?.enviar({ t: "sync" }); // el evento no trae el detalle: refresco
        }
        break;
      }
      case "tomado": {
        const t = m as { acta: string; detalle: MiCaso["detalle"] };
        this.st.miCaso = { acta: t.acta, detalle: t.detalle };
        this.st.aviso = null;
        this.emitir();
        break;
      }
      case "liberado":
        this.st.miCaso = null;
        this.emitir();
        break;
      case "resuelto": {
        const r = m as { acta: string; estado: string };
        if (this.st.miCaso?.acta === r.acta) this.st.miCaso = null;
        this.st.aviso = `${r.acta}: ${r.estado}`;
        this.emitir();
        break;
      }
      case "caso_perdido": {
        const c = m as { acta: string; motivo: CasoPerdidoMotivo };
        this.st.miCaso = null; // cierro de inmediato: no sigo editando
        this.st.aviso = `Perdiste ${c.acta} (${c.motivo}).`;
        this.emitir();
        break;
      }
      case "presencia":
        this.st.presencia = (m as { auditores: PresenciaAuditor[] }).auditores;
        this.emitir();
        break;
      case "estado":
        this.st.degradado = (m as { degradado?: boolean }).degradado === true;
        this.emitir();
        break;
      case "error": {
        const codigo = (m as { codigo: ConsolaErrorCodigo }).codigo;
        // NO_DISPONIBLE es carrera normal entre auditores, no un fallo.
        this.st.aviso = codigo === "NO_DISPONIBLE" ? "Otro auditor tomó ese caso primero." : `Error: ${codigo}`;
        this.emitir();
        break;
      }
    }
  }

  private emitir(): void {
    this.ev.onEstado({ ...this.st });
  }
}
