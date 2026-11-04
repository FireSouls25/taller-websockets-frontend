// Motor de envío: WS con respaldo POST, reintento solo con backoff+jitter (RT-6).
// - Los reintentos usan el MISMO idem (nunca se regenera).
// - Un acta sale de la cola solo con ack definitivo; sin ack no hay confirmación.
// - Con degradado:true los envíos quedan en espera y se avisa.
import {
  abrirWs,
  apiBase,
  debeQuitarDeCola,
  esperaBackoff,
  httpPost,
  type Acta,
  type ActaAck,
  type WsCanal,
} from "@preconteo/shared";
import { guardarEnCola, listarCola, marcarEstado, quitarDeCola, type RegistroCola } from "./cola-store.js";
import { textoDeAck } from "./ack-vista.js";

export interface MotorEventos {
  onCola: (cola: RegistroCola[]) => void;
  onConexion: (s: "conectando" | "abierto" | "reconectando" | "en-espera") => void;
  onAviso: (texto: string | null) => void;
}

function wsBase(): string {
  return apiBase().replace(/^http/, "ws");
}

const REENVIO_MS = 30_000;

export class MotorEnvio {
  private canal: WsCanal | null = null;
  private wsAbierto = false;
  private intento = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private drenando = false;
  private enEspera = false;

  constructor(
    private token: string,
    private ev: MotorEventos,
  ) {}

  arrancar(): void {
    this.conectarWs();
    window.addEventListener("online", this.alRecuperarRed);
    void this.refrescar();
    void this.drenar();
  }

  detener(): void {
    window.removeEventListener("online", this.alRecuperarRed);
    if (this.timer) clearTimeout(this.timer);
    this.canal?.cerrar();
  }

  /** Guarda ANTES de enviar: aunque se corte todo, el acta sobrevive. */
  async encolar(acta: Acta, foto: Blob | null): Promise<void> {
    await guardarEnCola({
      idem: acta.idem,
      acta,
      foto,
      estado: "guardada",
      intentos: 0,
      actualizadaEn: Date.now(),
    });
    await this.refrescar();
    void this.drenar();
  }

  private alRecuperarRed = (): void => {
    this.intento = 0;
    void this.drenar();
  };

  private conectarWs(): void {
    this.ev.onConexion("conectando");
    this.canal = abrirWs(`${wsBase()}/ws/jurado?token=${encodeURIComponent(this.token)}`, {
      onMensaje: (m) => void this.alMensaje(m),
      onEstado: (s) => {
        if (s === "abierto") {
          this.wsAbierto = true;
          this.intento = 0;
          this.ev.onConexion(this.enEspera ? "en-espera" : "abierto");
          void this.drenar();
        } else if (s === "conectando") {
          this.ev.onConexion("conectando");
        } else {
          this.wsAbierto = false;
          this.ev.onConexion(this.enEspera ? "en-espera" : "reconectando");
        }
      },
    });
  }

  private async alMensaje(m: unknown): Promise<void> {
    const msg = m as { t?: string };
    if (msg.t === "ack") {
      this.intento = 0;
      await this.alAck(m as ActaAck);
      return;
    }
    if (msg.t === "estado") {
      const degradado = (m as { degradado?: boolean }).degradado === true;
      this.enEspera = degradado;
      this.ev.onAviso(degradado ? "Red o sistema degradado: los envíos quedan en espera." : null);
      this.ev.onConexion(degradado ? "en-espera" : "abierto");
      if (!degradado) void this.drenar();
      return;
    }
    if (msg.t === "estado_acta") {
      const info = m as { acta: string; estado: string };
      this.ev.onAviso(`${info.acta}: estado ${info.estado}`);
      await this.refrescar();
    }
  }

  private async alAck(ack: ActaAck): Promise<void> {
    if (debeQuitarDeCola(ack)) {
      await quitarDeCola(ack.idem);
    } else {
      await marcarEstado(ack.idem, { estado: "enviando", ultimoError: textoDeAck(ack) });
    }
    this.ev.onAviso(`${ack.acta}: ${textoDeAck(ack)}`);
    await this.refrescar();
    void this.drenar();
  }

  private async refrescar(): Promise<void> {
    this.ev.onCola(await listarCola());
  }

  private programarReintento(): void {
    if (this.timer) return;
    const ms = esperaBackoff(this.intento);
    this.intento += 1;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.drenar();
    }, ms);
  }

  private async drenar(): Promise<void> {
    if (this.drenando || this.enEspera) return;
    this.drenando = true;
    try {
      const cola = await listarCola();
      const pendientes = cola.filter(
        (r) =>
          r.estado === "guardada" ||
          (r.estado === "enviando" && Date.now() - r.actualizadaEn > REENVIO_MS),
      );
      if (pendientes.length === 0) return;
      for (const r of pendientes) {
        await marcarEstado(r.idem, { estado: "enviando", intentos: r.intentos + 1 });
        try {
          if (this.wsAbierto) {
            // Canal principal: el ack real llega a alMensaje y decide la cola.
            this.canal?.enviar({ t: "acta", data: r.acta });
          } else {
            // Respaldo POST con el mismo cuerpo y la misma respuesta del acta.
            const ack = await httpPost<ActaAck, Acta>("/api/actas", r.acta, { token: this.token });
            await this.alAck(ack);
          }
        } catch (e) {
          // Sin red: el acta queda en cola; el reintento es automático.
          await marcarEstado(r.idem, {
            ultimoError: e instanceof Error ? e.message : "sin conexión",
          });
        }
      }
      await this.refrescar();
      const quedan = (await listarCola()).length;
      if (quedan > 0) this.programarReintento();
    } finally {
      this.drenando = false;
    }
  }
}
