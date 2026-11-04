// Dominio resultados: estado por tópico + render con rAF (RT-9).
// snapshot REEMPLAZA, delta fusiona (ver @preconteo/shared). Sin gráficos
// pesados: el ranking es una lista cuya fila es la barra (proporcional).
import {
  abrirStream,
  aplicarDelta,
  aplicarSnapshot,
  estadoInicial,
  httpGet,
  obtenerInstancia,
  type Correccion,
  type Delta,
  type Snapshot,
  type SseCanal,
  type TopicState,
} from "@preconteo/shared";

const $ = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`falta #${id}`);
  return el;
};

const fmtInt = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });

function nombreAmbito(topic: string): string {
  if (topic === "dep") return "Departamento";
  const [kind, n] = topic.split(":");
  if (kind === "mun") return `Municipio ${n}`;
  if (kind === "puesto") return `Puesto ${n}`;
  return topic;
}

export function montarVista(topicFijo: string, topicInicial: string): void {
  const estados = new Map<string, TopicState>([
    [topicFijo, estadoInicial()],
    [topicInicial, estadoInicial()],
  ]);
  const etags = new Map<string, string>();
  const canales = new Map<string, SseCanal>();
  let pendientePintar = false;
  let visible = topicInicial;

  pintarCarga();
  void obtenerInstancia().then((i) => {
    $("instancia").textContent = `instancia ${i}`;
  });

  const pintar = (): void => {
    pendientePintar = false;
    const d = estados.get(visible)?.data ?? estados.get(topicFijo)?.data;
    if (!d) return;
    $("crumb").textContent = nombreAmbito(visible);
    $("frescura").textContent =
      `Informe rápido, no oficial · ${fmtInt.format(d.informadas)} de ${fmtInt.format(d.total)} mesas · ${new Date(d.ts).toLocaleTimeString("es-CO")}`;
    $("k-mesas").textContent = `${fmtInt.format(d.informadas)}/${fmtInt.format(d.total)}`;
    $("k-avance").textContent = `${d.pct.toFixed(1)} %`;
    $("k-suf").textContent = fmtInt.format(d.sufragantes);
    const horaCorta = new Date(d.ts).toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" });
    $("k-hora").textContent = horaCorta;
    pintarRanking(d);
    pintarCorrecciones(d.corr ?? []);
  };

  const pedirPintar = (): void => {
    if (pendientePintar) return;
    pendientePintar = true;
    requestAnimationFrame(pintar);
  };

  const reconectar = (topic: string): void => {
    canales.get(topic)?.cerrar();
    canales.delete(topic);
    conectar(topic);
  };

  const conectar = (topic: string): void => {
    if (canales.has(topic)) return;
    if (!estados.has(topic)) estados.set(topic, estadoInicial());
    const etag = etags.get(topic);
    void httpGet<Snapshot>(
      `/api/public/snapshot?topic=${encodeURIComponent(topic)}`,
      etag !== undefined ? { etag } : {},
    )
      .then((r) => {
        if ("notModified" in r) return;
        const st = estados.get(topic) ?? estadoInicial();
        estados.set(topic, aplicarSnapshot(st, r.data));
        if (r.etag) etags.set(topic, r.etag);
        pedirPintar();
      })
      .catch(() => pintarError(topic));

    const canal = abrirStream(
      topic,
      () => {
        const s = estados.get(topic)?.seq;
        return s !== undefined && s >= 0 ? s : null;
      },
      {
        onEstado: (s) => {
          const pill = $("estado-conexion");
          if (s === "en-vivo") {
            pill.textContent = "en vivo";
            pill.className = "pill live";
          } else {
            pill.textContent = "reconectando…";
            pill.className = "pill neutral";
          }
        },
        onEvento: (e) => {
          const st = estados.get(topic) ?? estadoInicial();
          if (e.tipo === "snapshot") {
            estados.set(topic, aplicarSnapshot(st, e.payload as Snapshot));
            pedirPintar();
          } else if (e.tipo === "delta") {
            const r = aplicarDelta(st, e.payload as Delta);
            if (r.accion === "aplicado") {
              estados.set(topic, r.state);
              pedirPintar();
            } else if (r.accion === "hueco") {
              reconectar(topic);
            }
          } else if (e.tipo === "sistema") {
            const deg = (e.payload as { degradado?: boolean }).degradado === true;
            ($("pausa") as HTMLElement).hidden = !deg;
            if (deg) $("pausa-hora").textContent = new Date().toLocaleTimeString("es-CO");
          } else if (e.tipo === "reconectar") {
            reconectar(topic);
          }
        },
      },
    );
    canales.set(topic, canal);
  };

  conectar(topicFijo);
  conectar(visible);

  $("topic").addEventListener("change", (ev) => {
    visible = (ev.target as HTMLSelectElement).value;
    conectar(visible);
    pedirPintar();
  });

  $("mesa-form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const id = ($("mesa-id") as HTMLInputElement).value.trim();
    if (id === "") return;
    const box = $("mesa-detalle");
    box.innerHTML = '<span class="dash">cargando…</span>';
    void httpGet<{ mesa: number; puesto: number; municipio: number; votos: Record<string, number>; sufragantes: number }>(
      `/api/public/mesa/${encodeURIComponent(id)}`,
    )
      .then((r) => {
        if ("notModified" in r) return;
        const m = r.data;
        const dl = document.createElement("dl");
        const filas: Array<[string, string]> = [
          ["Mesa", fmtInt.format(m.mesa)],
          ["Puesto", fmtInt.format(m.puesto)],
          ["Municipio", fmtInt.format(m.municipio)],
          ["Sufragantes", fmtInt.format(m.sufragantes)],
        ];
        for (const [k, v] of Object.entries(m.votos)) filas.push([k, fmtInt.format(v)]);
        for (const [k, v] of filas) {
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
        p.textContent = "No se pudo cargar la mesa. ";
        const b = document.createElement("button");
        b.type = "button";
        b.className = "texto";
        b.textContent = "Reintentar";
        b.onclick = () =>
          ($("mesa-form") as HTMLFormElement).requestSubmit();
        p.appendChild(b);
        box.appendChild(p);
      });
  });
}

function pintarCarga(): void {
  const ol = $("ranking");
  ol.classList.add("carga");
  ol.innerHTML = "";
  for (let i = 0; i < 4; i += 1) {
    const li = document.createElement("li");
    li.innerHTML = '<span class="barra"></span>';
    ol.appendChild(li);
  }
  $("correcciones").innerHTML = '<p class="vacio">Esperando datos en vivo…</p>';
}

function pintarError(topic: string): void {
  const box = $("correcciones");
  if (box.querySelector(".vacio") === null) return;
  box.innerHTML = "";
  const p = document.createElement("p");
  p.className = "error";
  p.textContent = `Sin conexión con ${nombreAmbito(topic)}. `;
  const b = document.createElement("button");
  b.type = "button";
  b.className = "texto";
  b.textContent = "Reintentar";
  b.onclick = () => window.location.reload();
  p.appendChild(b);
  box.appendChild(p);
}

function pintarRanking(d: Snapshot): void {
  const ol = $("ranking");
  ol.classList.remove("carga");
  const max = Math.max(1, ...Object.values(d.votos));
  const lider = d.rank[0]?.[0];
  const filas = new Map(
    [...ol.children].map((li) => [(li as HTMLElement).dataset["k"], li as HTMLElement]),
  );
  for (const [cand, votos] of Object.entries(d.votos)) {
    let li = filas.get(cand);
    if (!li) {
      li = document.createElement("li");
      li.dataset["k"] = cand;
      li.innerHTML =
        '<span class="relleno"></span><span class="nombre"></span><span class="votos mono num"></span>';
      ol.appendChild(li);
    }
    li.classList.toggle("lider", cand === lider);
    (li.querySelector(".relleno") as HTMLElement).style.width = `max(56px, ${(votos / max) * 100}%)`;
    const nom = li.querySelector(".nombre") as HTMLElement;
    const val = li.querySelector(".votos") as HTMLElement;
    if (nom.textContent !== cand) nom.textContent = cand;
    const txt = fmtInt.format(votos);
    if (val.textContent !== txt) val.textContent = txt;
    filas.delete(cand);
  }
  for (const vieja of filas.values()) vieja.remove();
  // Ordena sin reconstruir: rank del servidor primero, resto por votos desc.
  const orden = [...d.rank.map(([c]) => c)];
  for (const [cand] of Object.entries(d.votos).sort((a, b) => b[1] - a[1])) {
    if (!orden.includes(cand)) orden.push(cand);
  }
  for (const cand of orden) {
    const li = ol.querySelector(`li[data-k="${cand}"]`);
    if (li) ol.appendChild(li);
  }
}

function pintarCorrecciones(corr: Correccion[]): void {
  const box = $("correcciones");
  box.innerHTML = "";
  if (corr.length === 0) {
    box.innerHTML = '<p class="vacio">Sin correcciones en este ámbito.</p>';
    return;
  }
  for (const c of corr.slice(0, 5)) {
    const p = document.createElement("p");
    p.className = "corr";
    const a = document.createElement("span");
    a.className = "acta";
    a.textContent = c.acta;
    const t = document.createElement("span");
    t.textContent = ` fue corregida, versión ${c.de} a ${c.a}.`;
    const m = document.createElement("span");
    m.className = "motivo";
    m.textContent = c.motivo;
    const time = document.createElement("time");
    time.textContent = new Date(c.ts).toLocaleTimeString("es-CO");
    p.append(a, t, m, time);
    box.appendChild(p);
  }
}
