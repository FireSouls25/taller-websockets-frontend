// Send engine: WS with POST fallback, retries only with backoff+jitter (RT-6).
// - Retries reuse the SAME idem (never regenerated).
// - A sheet leaves the queue only on a final ack; without ack, no confirmation.
// - With degradado:true sends wait on hold and the UI is told.
// UI copy is injected so the domain stays text-free.
import {
  apiBase,
  backoffDelay,
  fromWireAck,
  httpPost,
  openWs,
  shouldRemoveFromQueue,
  toWireSheet,
  type PendingStatus,
  type TallyAck,
  type TallyAckWire,
  type TallySheet,
  type TallySheetWire,
  type WsChannel,
} from "@preconteo/shared";
import { listQueue, removeFromQueue, saveSubmission, updateStatus } from "./queue-store.js";

export interface EngineCopy {
  ackNotice: (ack: TallyAck) => string;
  degradedNotice: string;
  recordState: (record: string, state: string) => string;
}

export interface EngineEvents {
  onQueue: (queue: Array<{ idem: string; sheet: TallySheet; status: PendingStatus; attempts: number; lastError?: string }>) => void;
  onConnection: (s: "connecting" | "open" | "reconnecting" | "on-hold") => void;
  onNotice: (text: string | null) => void;
}

export type QueueView = Parameters<EngineEvents["onQueue"]>[0];

function wsBase(): string {
  return apiBase().replace(/^http/, "ws");
}

const RESEND_MS = 30_000;

export class SendEngine {
  private channel: WsChannel | null = null;
  private wsOpen = false;
  private attempt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private draining = false;
  private onHold = false;

  constructor(
    private token: string,
    private events: EngineEvents,
    private copy: EngineCopy,
  ) {}

  start(): void {
    this.connectWs();
    window.addEventListener("online", this.onBackOnline);
    void this.refresh();
    void this.drain();
  }

  stop(): void {
    window.removeEventListener("online", this.onBackOnline);
    if (this.timer) clearTimeout(this.timer);
    this.channel?.close();
  }

  /** Stores BEFORE sending: whatever breaks, the sheet survives. */
  async enqueue(sheet: TallySheet, photo: Blob | null): Promise<void> {
    await saveSubmission({
      idem: sheet.idem,
      sheet,
      photo,
      status: "stored",
      attempts: 0,
      updatedAt: Date.now(),
    });
    await this.refresh();
    void this.drain();
  }

  private onBackOnline = (): void => {
    this.attempt = 0;
    void this.drain();
  };

  private connectWs(): void {
    this.events.onConnection("connecting");
    this.channel = openWs(`${wsBase()}/ws/jurado?token=${encodeURIComponent(this.token)}`, {
      onMessage: (m) => void this.onMessage(m),
      onStatus: (s) => {
        if (s === "open") {
          this.wsOpen = true;
          this.attempt = 0;
          this.events.onConnection(this.onHold ? "on-hold" : "open");
          void this.drain();
        } else if (s === "connecting") {
          this.events.onConnection("connecting");
        } else {
          this.wsOpen = false;
          this.events.onConnection(this.onHold ? "on-hold" : "reconnecting");
        }
      },
    });
  }

  private async onMessage(m: unknown): Promise<void> {
    const msg = m as { t?: string };
    if (msg.t === "ack") {
      this.attempt = 0;
      await this.onAck(fromWireAck(m as TallyAckWire));
      return;
    }
    if (msg.t === "estado") {
      const degraded = (m as { degradado?: boolean }).degradado === true;
      this.onHold = degraded;
      this.events.onNotice(degraded ? this.copy.degradedNotice : null);
      this.events.onConnection(degraded ? "on-hold" : "open");
      if (!degraded) void this.drain();
      return;
    }
    if (msg.t === "estado_acta") {
      const info = m as { acta: string; estado: string };
      this.events.onNotice(this.copy.recordState(info.acta, info.estado));
      await this.refresh();
    }
  }

  private async onAck(ack: TallyAck): Promise<void> {
    if (shouldRemoveFromQueue(ack)) {
      await removeFromQueue(ack.idem);
    } else {
      await updateStatus(ack.idem, { status: "sending", lastError: this.copy.ackNotice(ack) });
    }
    this.events.onNotice(this.copy.ackNotice(ack));
    await this.refresh();
    void this.drain();
  }

  private async refresh(): Promise<void> {
    const queue = await listQueue();
    this.events.onQueue(
      queue.map((r) => ({
        idem: r.idem,
        sheet: r.sheet,
        status: r.status,
        attempts: r.attempts,
        ...(r.lastError !== undefined ? { lastError: r.lastError } : {}),
      })),
    );
  }

  private scheduleRetry(): void {
    if (this.timer) return;
    const ms = backoffDelay(this.attempt);
    this.attempt += 1;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.drain();
    }, ms);
  }

  private async drain(): Promise<void> {
    if (this.draining || this.onHold) return;
    this.draining = true;
    try {
      const queue = await listQueue();
      const pending = queue.filter(
        (r) =>
          r.status === "stored" || (r.status === "sending" && Date.now() - r.updatedAt > RESEND_MS),
      );
      if (pending.length === 0) return;
      for (const r of pending) {
        await updateStatus(r.idem, { status: "sending", attempts: r.attempts + 1 });
        try {
          if (this.wsOpen) {
            // Main channel: the real ack arrives at onMessage and decides the queue.
            this.channel?.send({ t: "acta", data: toWireSheet(r.sheet) });
          } else {
            // POST fallback with the same body; its response is the ack.
            const wire = await httpPost<TallyAckWire, TallySheetWire>("/api/actas", toWireSheet(r.sheet), {
              token: this.token,
            });
            await this.onAck(fromWireAck(wire));
          }
        } catch (e) {
          // Offline: the sheet stays queued; retry is automatic.
          await updateStatus(r.idem, {
            lastError: e instanceof Error ? e.message : "offline",
          });
        }
      }
      await this.refresh();
      const left = (await listQueue()).length;
      if (left > 0) this.scheduleRetry();
    } finally {
      this.draining = false;
    }
  }
}
