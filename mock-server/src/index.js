// Mock local del contrato (brief del taller) para avanzar sin backend.
// Endpoints: auth, catalogo, snapshot(+ETag), stream(SSE), mesa/:id,
// actas(POST), ws/jurado, ws/consola, ops/metrics, instance.
// Flags por query en /stream: ?modo=gap|retro|degradado|503
import cors from "cors";
import express from "express";
import { WebSocketServer } from "ws";

const PORT = Number(process.env.MOCK_PORT ?? 3000);
const INSTANCE = `mock-${Math.random().toString(36).slice(2, 6)}`;
const app = express();
app.use(cors());
app.use(express.json());

// --- estado en memoria: seq monótono por tópico ---
const seqPorTopico = new Map();
const estadoPorTopico = new Map();
// Estado mutable por tópico para que el mock cumpla la regla contable:
// suma(votos) === sufragantes en cada mensaje, como exige el contrato.
function estado(topic) {
  let e = estadoPorTopico.get(topic);
  if (!e) {
    e = { votos: { ...votosBase }, suf: 627 };
    estadoPorTopico.set(topic, e);
  }
  return e;
}
const votosBase = { C1: 184, C2: 97, C3: 311, BLANCO: 22, NULO: 9, NO_MARCADO: 4 };
function seq(topic) {
  const s = (seqPorTopico.get(topic) ?? 119) + 1;
  seqPorTopico.set(topic, s);
  return s;
}
function snapshot(topic, s = seq(topic)) {
  const e = estado(topic);
  return {
    seq: s, topic, ts: Date.now(),
    votos: { ...e.votos }, sufragantes: e.suf,
    informadas: 3200, total: 6400, pct: 50,
    rank: [["C3", e.votos.C3], ["C1", e.votos.C1]],
    corr: [],
  };
}

app.post("/api/auth/login", (req, res) => {
  const { usuario } = req.body ?? {};
  if (typeof usuario !== "string") return res.status(400).json({ error: "ESQUEMA" });
  res.json({ token: `mock-${usuario}`, rol: usuario.split("-")[0], usuario });
});

app.get("/api/public/catalogo", (_req, res) => {
  res.json({
    municipios: Array.from({ length: 55 }, (_, i) => ({ id: i + 1, nombre: `Municipio ${i + 1}` })),
    puestos: 1842,
  });
});

app.get("/api/public/snapshot", (req, res) => {
  const topic = String(req.query.topic ?? "dep");
  const snap = snapshot(topic);
  const etag = `"${topic}-${snap.seq}"`;
  if (req.headers["if-none-match"] === etag) return res.status(304).end();
  res.setHeader("ETag", etag);
  res.json(snap);
});

app.get("/api/public/mesa/:id", (req, res) => {
  res.json({ mesa: Number(req.params.id), puesto: 176, municipio: 11, votos: { ...votosBase }, sufragantes: 627 });
});

// SSE: un tópico por conexión. Eventos snapshot/delta/sistema/reconectar.
app.get("/api/public/stream", (req, res) => {
  const topic = String(req.query.topic ?? "dep");
  const modo = String(req.query.modo ?? "");
  if (modo === "503") {
    res.setHeader("Retry-After", "2");
    return res.status(503).json({ error: "SERVICIO_NO_DISPONIBLE" });
  }
  const lastEventId = Number(req.query.lastEventId ?? -1);
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  // Fotografía inicial (continuidad RF-6: si hay lastEventId, el real enviaría deltas perdidos o snapshot)
  send("snapshot", snapshot(topic, Number.isNaN(lastEventId) ? seq(topic) : Math.max(seq(topic), lastEventId + 1)));
  let n = 0;
  const t = setInterval(() => {
    n += 1;
    if (modo === "degradado") return send("sistema", { degradado: true, desde: Date.now() });
    if (modo === "retro" && n === 2) {
      const s = seq(topic);
      const e = estado(topic);
      e.votos.C3 = 300;
      e.suf -= 11; // la corrección revierte 11 votos: el total cambia con explicación
      return send("delta", {
        seq: s, topic, ts: Date.now(), votos: { C3: 300 }, sufragantes: e.suf, retro: true,
        corr: [{ acta: "E14-176-0042-03", de: 1, a: 2, motivo: "CORRECCION", ts: Date.now() }],
      });
    }
    if (modo === "gap" && n === 2) return send("delta", { seq: seq(topic) + 5, topic, ts: Date.now(), votos: { C1: 190 } });
    const e = estado(topic);
    e.votos.C1 += 1;
    e.suf += 1;
    send("delta", { seq: seq(topic), topic, ts: Date.now(), votos: { C1: e.votos.C1 }, sufragantes: e.suf });
  }, 2000);
  req.on("close", () => clearInterval(t));
});

app.post("/api/actas", (req, res) => {
  const { acta, version, idem } = req.body ?? {};
  if (typeof acta !== "string" || typeof idem !== "string") return res.status(400).json({ error: "ESQUEMA" });
  // Idempotencia ingenua del mock: mismo idem => duplicado:true pero REGISTRADA.
  res.json({ t: "ack", acta, version: version ?? 1, idem, estado: "REGISTRADA", duplicado: false, ts: Date.now() });
});

app.get("/api/ops/metrics", (_req, res) => {
  res.json({
    instancias: [{
      id: INSTANCE, conexionesPublicas: 12, conexionesJurados: 3, conexionesConsolas: 2,
      eventLoopP50: 4, eventLoopP99: 18, eventLoopMax: 40, memoriaPorConexion: 24,
      mensajesPorSegundo: 30, redis: "ok",
    }],
    global: {
      mensajesEmitidosTotal: 1200, cifraIngenua: 2560000000,
      conexionesTotales: 17, actasPorMinuto: 90, retrasoPublicacion: 1800,
    },
  });
});

app.get("/api/instance", (_req, res) => res.json({ instance: INSTANCE }));

const server = app.listen(PORT, () => console.log(`[mock] http://localhost:${PORT} instance=${INSTANCE}`));

// --- WS jurado: acta -> ack; respeta idem (mismo idem = duplicado) ---
const vistos = new Map();
const wss = new WebSocketServer({ server });
wss.on("connection", (ws, req) => {
  const url = new URL(req.url ?? "/", "http://x");
  if (url.pathname === "/ws/jurado") {
    ws.on("message", (raw) => {
      const msg = JSON.parse(String(raw));
      if (msg.t === "acta") {
        const { acta, version, idem } = msg.data ?? {};
        if (vistos.has(idem)) return ws.send(JSON.stringify({ t: "ack", acta, version, idem, estado: "REGISTRADA", duplicado: true, ts: Date.now() }));
        vistos.set(idem, true);
        ws.send(JSON.stringify({ t: "ack", acta, version, idem, estado: "REGISTRADA", ts: Date.now() }));
      }
      if (msg.t === "consultar") ws.send(JSON.stringify({ t: "estado_acta", acta: msg.acta, version: 1, estado: "REGISTRADA" }));
    });
    return;
  }
  if (url.pathname === "/ws/consola") {
    atenderConsola(ws, url);
  }
});

// --- WS consola: cola con asignación exclusiva (el backend decide orden y dueño) ---
let revConsola = 41;
const colaVerif = [
  { acta: "E14-176-0042-03", version: 1, motivo: "REGLA_CONTABLE", prioridad: 9, mesa: 4201, puesto: 176, municipio: 11, recibida: Date.now() },
  { acta: "E14-088-0011-01", version: 2, motivo: "CONFLICTO_VERSION", prioridad: 5, mesa: 12, puesto: 88, municipio: 3, recibida: Date.now() },
];
const casosVerif = new Map(); // acta -> { auditor, desde }
const consolas = new Set(); // { ws, auditor, esCoord }

function auditorDe(url) {
  const t = url.searchParams.get("token") ?? "mock-AUD-0";
  return t.replace(/^mock-/, "");
}

function fotoConsola(solicitante) {
  const casos = [...casosVerif.entries()].map(([acta, c]) => ({ acta, auditor: c.auditor, desde: c.desde }));
  const mio = [...casosVerif.entries()].find(([, c]) => c.auditor === solicitante)?.[0];
  const snap = { t: "snapshot", rev: revConsola, total_cola: colaVerif.length, cola: colaVerif, casos };
  if (mio) snap.mi_caso = { acta: mio, detalle: detalleDe(mio) };
  return snap;
}

function detalleDe(acta) {
  const item = colaVerif.find((c) => c.acta === acta);
  return {
    motivo: item?.motivo ?? "REGLA_CONTABLE",
    votos: { ...votosBase },
    sufragantes: 626,
    version: item?.version ?? 1,
  };
}

function emitirConsola(obj, soloCoords = false) {
  const s = JSON.stringify(obj);
  for (const c of consolas) {
    if (soloCoords && !c.esCoord) continue;
    try { c.ws.send(s); } catch { /* ignorar */ }
  }
}

function emitirPresencia() {
  const auditores = [...consolas].map((c) => {
    const caso = [...casosVerif.entries()].find(([, k]) => k.auditor === c.auditor)?.[0];
    const desde = caso ? casosVerif.get(caso).desde : undefined;
    const base = { auditor: c.auditor, info: c.esCoord ? "coordinación" : "auditoría" };
    return caso ? { ...base, acta: caso, desde } : base;
  });
  emitirConsola({ t: "presencia", auditores }, true);
}

function atenderConsola(ws, url) {
  const auditor = auditorDe(url);
  const esCoord = auditor.startsWith("COORD-");
  const yo = { ws, auditor, esCoord };
  consolas.add(yo);
  ws.send(JSON.stringify(fotoConsola(auditor)));
  emitirPresencia();
  const latido = setInterval(emitirPresencia, 5000);

  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(String(raw)); } catch { return; }
    if (msg.t === "sync") return ws.send(JSON.stringify(fotoConsola(auditor)));
    if (msg.t === "actividad") return emitirPresencia();
    if (msg.t === "tomar") {
      const tomado = [...casosVerif.entries()].find(([, c]) => c.auditor === auditor)?.[0];
      if (tomado) return ws.send(JSON.stringify({ t: "error", codigo: "YA_TIENE_CASO" }));
      const item = msg.acta
        ? colaVerif.find((c) => c.acta === msg.acta)
        : [...colaVerif].sort((a, b) => b.prioridad - a.prioridad)[0];
      if (!item) {
        if (msg.acta && casosVerif.has(msg.acta)) {
          return ws.send(JSON.stringify({ t: "error", codigo: "NO_DISPONIBLE" }));
        }
        return ws.send(JSON.stringify({ t: "error", codigo: msg.acta ? "DATOS_INVALIDOS" : "COLA_VACIA" }));
      }
      if (casosVerif.has(item.acta)) return ws.send(JSON.stringify({ t: "error", codigo: "NO_DISPONIBLE" }));
      const detalle = detalleDe(item.acta);
      colaVerif.splice(colaVerif.indexOf(item), 1);
      casosVerif.set(item.acta, { auditor, desde: Date.now() });
      revConsola += 1;
      ws.send(JSON.stringify({ t: "tomado", acta: item.acta, desde: Date.now(), detalle }));
      emitirConsola({ t: "evento", rev: revConsola, tipo: "tomado", acta: item.acta, auditor });
      return emitirPresencia();
    }
    if (msg.t === "liberar") {
      const acta = [...casosVerif.entries()].find(([, c]) => c.auditor === auditor)?.[0];
      if (!acta) return ws.send(JSON.stringify({ t: "error", codigo: "SIN_CASO" }));
      const dueno = casosVerif.get(acta);
      if (dueno.auditor !== auditor) return ws.send(JSON.stringify({ t: "error", codigo: "BLOQUEO_PERDIDO" }));
      casosVerif.delete(acta);
      revConsola += 1;
      ws.send(JSON.stringify({ t: "liberado", acta }));
      emitirConsola({ t: "evento", rev: revConsola, tipo: "liberado", acta, auditor });
      return emitirPresencia();
    }
    if (msg.t === "resolver") {
      const acta = [...casosVerif.entries()].find(([, c]) => c.auditor === auditor)?.[0];
      if (!acta) return ws.send(JSON.stringify({ t: "error", codigo: "SIN_CASO" }));
      const dueno = casosVerif.get(acta);
      if (dueno.auditor !== auditor) return ws.send(JSON.stringify({ t: "error", codigo: "BLOQUEO_PERDIDO" }));
      if (msg.decision === "CORREGIR") {
        const suma = Object.values(msg.votos ?? {}).reduce((a, b) => a + b, 0);
        if (suma !== msg.sufragantes) return ws.send(JSON.stringify({ t: "error", codigo: "DATOS_INVALIDOS" }));
      }
      casosVerif.delete(acta);
      revConsola += 1;
      const estado = msg.decision === "RECHAZAR" ? "RECHAZADA_EN_VERIFICACION" : "REGISTRADA";
      ws.send(JSON.stringify({ t: "resuelto", acta, version: 1, estado }));
      emitirConsola({ t: "evento", rev: revConsola, tipo: "resuelto", acta, auditor });
      return emitirPresencia();
    }
  });

  ws.on("close", () => {
    consolas.delete(yo);
    clearInterval(latido);
    // Sin conexión el caso se pierde en 30 s y vuelve a la cola.
    const acta = [...casosVerif.entries()].find(([, c]) => c.auditor === auditor)?.[0];
    if (!acta) return emitirPresencia();
    setTimeout(() => {
      if (casosVerif.get(acta)?.auditor !== auditor) return;
      casosVerif.delete(acta);
      revConsola += 1;
      emitirConsola({ t: "evento", rev: revConsola, tipo: "expirado", acta, auditor });
      emitirPresencia();
    }, 30_000);
    emitirPresencia();
  });
}
