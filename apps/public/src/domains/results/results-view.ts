// Results domain: per-topic state + rAF render (RT-9).
// snapshot REPLACES, delta merges (see @preconteo/shared). No heavy charts:
// the ranking is a list whose row is the bar (proportional).
import {
  applyDelta,
  applySnapshot,
  fetchInstance,
  fromWireDelta,
  fromWireSnapshot,
  httpGet,
  initialState,
  openStream,
  type DeltaWire,
  type ResultsDelta,
  type ResultsSnapshot,
  type SnapshotWire,
  type SseChannel,
  type TopicState,
} from "@preconteo/shared";
import { es, scopeName } from "../../i18n/es.js";

const $ = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
};

function shortTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" });
}

export function mountView(fixedTopic: string, initialTopic: string): void {
  applyCopy();
  const states = new Map<string, TopicState>([
    [fixedTopic, initialState()],
    [initialTopic, initialState()],
  ]);
  const etags = new Map<string, string>();
  const channels = new Map<string, SseChannel>();
  let paintQueued = false;
  let visible = initialTopic;

  paintLoading();
  void fetchInstance().then((i) => {
    $("instance-badge").textContent = es.connection.instance(i);
  });

  const paint = (): void => {
    paintQueued = false;
    const d = states.get(visible)?.snapshot ?? states.get(fixedTopic)?.snapshot;
    if (!d) return;
    $("scope-crumb").textContent = scopeName(visible);
    $("freshness").textContent = es.freshness(d.reported, d.total, shortTime(d.timestamp));
    $("k-reported").textContent = `${es.formatInt(d.reported)}/${es.formatInt(d.total)}`;
    $("k-progress").textContent = `${d.percent.toFixed(1)} %`;
    $("k-voters").textContent = es.formatInt(d.voters);
    $("k-time").textContent = shortTime(d.timestamp);
    paintRanking(d);
    paintCorrections(d.corrections ?? []);
  };

  const requestPaint = (): void => {
    if (paintQueued) return;
    paintQueued = true;
    requestAnimationFrame(paint);
  };

  const reconnect = (topic: string): void => {
    channels.get(topic)?.close();
    channels.delete(topic);
    connect(topic);
  };

  const connect = (topic: string): void => {
    if (channels.has(topic)) return;
    if (!states.has(topic)) states.set(topic, initialState());
    const etag = etags.get(topic);
    void httpGet<SnapshotWire>(
      `/api/public/snapshot?topic=${encodeURIComponent(topic)}`,
      etag !== undefined ? { etag } : {},
    )
      .then((r) => {
        if ("notModified" in r) return;
        const st = states.get(topic) ?? initialState();
        states.set(topic, applySnapshot(st, fromWireSnapshot(r.data)));
        if (r.etag) etags.set(topic, r.etag);
        requestPaint();
      })
      .catch(() => paintError(topic));

    const channel = openStream(
      topic,
      () => {
        const s = states.get(topic)?.seq;
        return s !== undefined && s >= 0 ? s : null;
      },
      {
        onStatus: (s) => {
          const pill = $("connection-status");
          if (s === "live") {
            pill.textContent = es.connection.live;
            pill.className = "pill live";
          } else {
            pill.textContent = es.connection.reconnecting;
            pill.className = "pill neutral";
          }
        },
        onEvent: (e) => {
          const st = states.get(topic) ?? initialState();
          if (e.kind === "snapshot") {
            states.set(topic, applySnapshot(st, fromWireSnapshot(e.payload as SnapshotWire)));
            requestPaint();
          } else if (e.kind === "delta") {
            const delta: ResultsDelta = fromWireDelta(e.payload as DeltaWire);
            const r = applyDelta(st, delta);
            if (r.action === "applied") {
              states.set(topic, r.state);
              requestPaint();
            } else if (r.action === "gap") {
              reconnect(topic);
            }
          } else if (e.kind === "sistema") {
            const degraded = (e.payload as { degradado?: boolean }).degradado === true;
            ($("connection-paused") as HTMLElement).hidden = !degraded;
            if (degraded) $("paused-at").textContent = shortTime(Date.now());
          } else if (e.kind === "reconectar") {
            reconnect(topic);
          }
        },
      },
    );
    channels.set(topic, channel);
  };

  connect(fixedTopic);
  connect(visible);

  $("scope-select")?.addEventListener("change", (ev) => {
    visible = (ev.target as HTMLSelectElement).value;
    connect(visible);
    requestPaint();
  });

  $("table-form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const id = ($("table-id") as HTMLInputElement).value.trim();
    if (id === "") return;
    const box = $("table-detail");
    box.innerHTML = `<span class="dash">${es.tableLookup.loading}</span>`;
    void httpGet<{ mesa: number; puesto: number; municipio: number; votos: Record<string, number>; sufragantes: number }>(
      `/api/public/mesa/${encodeURIComponent(id)}`,
    )
      .then((r) => {
        if ("notModified" in r) return;
        const detail = r.data;
        const dl = document.createElement("dl");
        const rows: Array<[string, string]> = [
          [es.tableLookup.fields.table, es.formatInt(detail.mesa)],
          [es.tableLookup.fields.station, es.formatInt(detail.puesto)],
          [es.tableLookup.fields.municipality, es.formatInt(detail.municipio)],
          [es.tableLookup.fields.voters, es.formatInt(detail.sufragantes)],
        ];
        for (const [k, v] of Object.entries(detail.votos)) rows.push([k, es.formatInt(v)]);
        for (const [k, v] of rows) {
          const dt = document.createElement("dt");
          dt.textContent = k;
          const dd = document.createElement("dd");
          dd.className = "mono num";
          dd.textContent = v;
          dl.append(dt, dd);
        }
        box.innerHTML = "";
        box.appendChild(dl);
      })
      .catch(() => {
        box.innerHTML = "";
        const p = document.createElement("p");
        p.className = "error";
        p.textContent = `${es.tableLookup.error} `;
        const b = document.createElement("button");
        b.type = "button";
        b.className = "inline-action";
        b.textContent = es.tableLookup.retry;
        b.onclick = () => ($("table-form") as HTMLFormElement).requestSubmit();
        p.appendChild(b);
        box.appendChild(p);
      });
  });
}

function applyCopy(): void {
  $("brand").textContent = es.brand;
  $("app-title").textContent = es.title;
  $("scope-label").textContent = es.scopeLabel;
  $("scope-note").textContent = es.scopeNote;
  $("k-reported-label").textContent = es.kpis.reported;
  $("k-progress-label").textContent = es.kpis.progress;
  $("k-voters-label").textContent = es.kpis.voters;
  $("k-time-label").textContent = es.kpis.updated;
  $("ranking-title").textContent = es.ranking.title;
  $("ranking-caption").textContent = es.ranking.caption;
  $("corrections-title").textContent = es.corrections.title;
  $("table-title").textContent = es.tableLookup.title;
  $("table-label").textContent = es.tableLookup.label;
  $("table-action").textContent = es.tableLookup.action;
  $("connection-title").textContent = es.connection.title;
  $("connection-note").textContent = es.connection.note;
  $("connection-status").textContent = es.connection.connecting;
  $("inp-note").textContent = es.connection.inpPending;
}

function paintLoading(): void {
  const ol = $("ranking");
  ol.classList.add("loading");
  ol.innerHTML = "";
  for (let i = 0; i < 4; i += 1) {
    const li = document.createElement("li");
    li.innerHTML = '<span class="bar"></span>';
    ol.appendChild(li);
  }
  $("corrections").innerHTML = `<p class="empty">${es.corrections.waiting}</p>`;
}

function paintError(topic: string): void {
  const box = $("corrections");
  if (box.querySelector(".empty") === null) return;
  box.innerHTML = "";
  const p = document.createElement("p");
  p.className = "error";
  p.textContent = `${es.connection.offline(scopeName(topic))} `;
  const b = document.createElement("button");
  b.type = "button";
  b.className = "inline-action";
  b.textContent = es.tableLookup.retry;
  b.onclick = () => window.location.reload();
  p.appendChild(b);
  box.appendChild(p);
}

function paintRanking(d: ResultsSnapshot): void {
  const ol = $("ranking");
  ol.classList.remove("loading");
  const max = Math.max(1, ...Object.values(d.votes));
  const leader = d.rank[0]?.[0];
  const rows = new Map(
    [...ol.children].map((li) => [(li as HTMLElement).dataset["k"], li as HTMLElement]),
  );
  for (const [cand, votes] of Object.entries(d.votes)) {
    let li = rows.get(cand);
    if (!li) {
      li = document.createElement("li");
      li.dataset["k"] = cand;
      li.innerHTML =
        '<span class="fill"></span><span class="name"></span><span class="votes mono num"></span>';
      ol.appendChild(li);
    }
    li.classList.toggle("leader", cand === leader);
    (li.querySelector(".fill") as HTMLElement).style.width = `max(56px, ${(votes / max) * 100}%)`;
    const nom = li.querySelector(".name") as HTMLElement;
    const val = li.querySelector(".votes") as HTMLElement;
    if (nom.textContent !== cand) nom.textContent = cand;
    const txt = es.formatInt(votes);
    if (val.textContent !== txt) val.textContent = txt;
    rows.delete(cand);
  }
  for (const stale of rows.values()) stale.remove();
  // Reorders without rebuilding: server rank first, rest by votes desc.
  const order = [...d.rank.map(([c]) => c)];
  for (const [cand] of Object.entries(d.votes).sort((a, b) => b[1] - a[1])) {
    if (!order.includes(cand)) order.push(cand);
  }
  for (const cand of order) {
    const li = ol.querySelector(`li[data-k="${cand}"]`);
    if (li) ol.appendChild(li);
  }
}

function paintCorrections(corrections: NonNullable<ResultsSnapshot["corrections"]>): void {
  const box = $("corrections");
  box.innerHTML = "";
  if (corrections.length === 0) {
    box.innerHTML = `<p class="empty">${es.corrections.empty}</p>`;
    return;
  }
  for (const c of corrections.slice(0, 5)) {
    const p = document.createElement("p");
    p.className = "correction";
    const t = document.createElement("span");
    t.textContent = es.corrections.corrected(c.record, c.from, c.to);
    const m = document.createElement("span");
    m.className = "reason";
    m.textContent = c.reason;
    const time = document.createElement("time");
    time.textContent = shortTime(c.timestamp);
    p.append(t, m, time);
    box.appendChild(p);
  }
}
