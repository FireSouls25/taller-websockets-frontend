// Console link: text revs, backend-owned exclusivity, presence.
// Rules: drop events at/below the snapshot rev; NO_DISPONIBLE is a normal
// race; caso_perdido closes the case; idle 5 min / offline 30 s releases it.
import {
  compareRev,
  fromWireCaseDetail,
  fromWireConsoleSnapshot,
  fromWireEventType,
  fromWireLostReason,
  fromWirePresence,
  isStaleEvent,
  openWs,
  apiBase,
  type AssignedCase,
  type AuditorPresence,
  type ConsoleErrorCode,
  type LostCaseReason,
  type MyCase,
  type ResolvedOutcome,
  type ReviewQueueItem,
  type WsChannel,
} from "@preconteo/shared";

export interface ConsoleView {
  connected: boolean;
  degraded: boolean;
  rev: string;
  queue: ReviewQueueItem[];
  cases: AssignedCase[];
  myCase: MyCase | null;
  presence: AuditorPresence[];
  notice: string | null;
  idleWarning: boolean;
}

export interface ConsoleEvents {
  onState: (s: ConsoleView) => void;
  onResolved: (record: string, outcome: ResolvedOutcome) => void;
  onRaceLost: () => void;
  onErrorCode: (code: ConsoleErrorCode) => void;
  onCaseLost: (record: string, reason: LostCaseReason) => void;
}

function wsBase(): string {
  return apiBase().replace(/^http/, "ws");
}

const ACTIVITY_MS = 15_000;
const IDLE_WARN_MS = 4 * 60_000;
const SYNC_DEBOUNCE_MS = 500;

export class ConsoleLink {
  private channel: WsChannel | null = null;
  private st: ConsoleView = {
    connected: false,
    degraded: false,
    rev: "0-0",
    queue: [],
    cases: [],
    myCase: null,
    presence: [],
    notice: null,
    idleWarning: false,
  };
  private lastInput = 0;
  private lastActivitySent = 0;
  private idleTimer: ReturnType<typeof setInterval> | null = null;
  private syncTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private token: string,
    private ev: ConsoleEvents,
  ) {}

  start(): void {
    this.channel = openWs(`${wsBase()}/ws/consola?token=${encodeURIComponent(this.token)}`, {
      onMessage: (m) => this.onMessage(m),
      onStatus: (s) => {
        this.st.connected = s === "open";
        if (s !== "open") {
          this.st.notice = null;
        }
        this.emit();
      },
    });
    const touch = (): void => this.input();
    window.addEventListener("mousemove", touch);
    window.addEventListener("keydown", touch);
    window.addEventListener("touchstart", touch);
    this.cleanup = () => {
      window.removeEventListener("mousemove", touch);
      window.removeEventListener("keydown", touch);
      window.removeEventListener("touchstart", touch);
    };
    this.lastInput = Date.now();
    this.idleTimer = setInterval(() => {
      const idle = Date.now() - this.lastInput > IDLE_WARN_MS;
      if (idle !== this.st.idleWarning) {
        this.st.idleWarning = idle;
        this.emit();
      }
    }, 15_000);
  }

  private cleanup: () => void = () => undefined;

  stop(): void {
    this.cleanup();
    if (this.idleTimer) clearInterval(this.idleTimer);
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.channel?.close();
  }

  take(record?: string): void {
    this.channel?.send(record ? { t: "tomar", acta: record } : { t: "tomar" });
  }

  release(): void {
    this.channel?.send({ t: "liberar" });
  }

  resolve(decision: "APROBAR" | "RECHAZAR" | "CORREGIR", votes?: Record<string, number>, voters?: number): void {
    if (decision === "CORREGIR") {
      this.channel?.send({ t: "resolver", decision, votos: votes, sufragantes: voters });
    } else {
      this.channel?.send({ t: "resolver", decision });
    }
  }

  private input(): void {
    this.lastInput = Date.now();
    if (this.st.idleWarning) {
      this.st.idleWarning = false;
      this.emit();
    }
    // Throttle: at most one every 15 s.
    if (Date.now() - this.lastActivitySent < ACTIVITY_MS) return;
    this.lastActivitySent = Date.now();
    this.channel?.send({ t: "actividad" });
  }

  private requestSync(): void {
    if (this.syncTimer) return;
    this.syncTimer = setTimeout(() => {
      this.syncTimer = null;
      this.channel?.send({ t: "sync" });
    }, SYNC_DEBOUNCE_MS);
  }

  private onMessage(m: unknown): void {
    const msg = m as { t?: string };
    switch (msg.t) {
      case "snapshot": {
        const s = fromWireConsoleSnapshot(
          m as { t: "snapshot"; rev: string; total_cola: number; cola: never[]; casos: never[] },
        );
        if (compareRev(s.rev, this.st.rev) < 0) return; // stale photograph
        this.st.rev = s.rev;
        this.st.queue = s.queue;
        this.st.cases = s.cases;
        if (s.myCase) this.st.myCase = s.myCase; // resume work after reconnect
        this.st.notice = null;
        this.emit();
        break;
      }
      case "evento": {
        const e = m as { rev: string; tipo: string; acta: string; auditor?: string };
        try {
          fromWireEventType(e.tipo);
        } catch {
          return; // unknown event kind: ignore
        }
        if (isStaleEvent(this.st.rev, e.rev)) return;
        // Events carry no detail: refresh the photograph (debounced).
        this.requestSync();
        break;
      }
      case "tomado": {
        const t = m as { acta: string; desde: number; detalle: { motivo: string; votos: Record<string, number>; sufragantes: number; version: number } };
        this.st.myCase = {
          record: t.acta,
          since: t.desde,
          detail: fromWireCaseDetail(t.detalle),
        };
        this.emit();
        break;
      }
      case "liberado":
        this.st.myCase = null;
        this.emit();
        break;
      case "resuelto": {
        const r = m as { acta: string; version: number; estado: ResolvedOutcome };
        if (this.st.myCase?.record === r.acta) this.st.myCase = null;
        this.ev.onResolved(r.acta, r.estado);
        this.requestSync();
        break;
      }
      case "caso_perdido": {
        const c = m as { acta: string; motivo: string };
        this.st.myCase = null; // close at once: never keep editing
        this.ev.onCaseLost(c.acta, fromWireLostReason(c.motivo));
        this.requestSync();
        break;
      }
      case "presencia": {
        const p = m as { auditores: Array<{ auditor: string; info: { instancia: string; rol: string; conectado_desde: number; ultima_actividad: number }; acta?: string; desde?: number }> };
        this.st.presence = p.auditores.map(fromWirePresence);
        this.emit();
        break;
      }
      case "estado":
        this.st.degraded = (m as { degradado?: boolean }).degradado === true;
        this.emit();
        break;
      case "error": {
        const code = (m as { codigo: ConsoleErrorCode }).codigo;
        if (code === "NO_DISPONIBLE") this.ev.onRaceLost();
        else this.ev.onErrorCode(code);
        break;
      }
    }
  }

  private emit(): void {
    this.ev.onState({ ...this.st });
  }
}
