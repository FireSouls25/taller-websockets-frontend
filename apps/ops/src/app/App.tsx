import { useEffect, useState, type JSX } from "react";
import { httpGet, obtenerInstancia, type OpsMetrics } from "@preconteo/shared";

const fmtInt = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });

export function App(): JSX.Element {
  const [m, setM] = useState<OpsMetrics | null>(null);
  const [instancia, setInstancia] = useState("…");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void obtenerInstancia().then(setInstancia);
    let viva = true;
    const pedir = (): void => {
      void httpGet<OpsMetrics>("/api/ops/metrics")
        .then((r) => {
          if (!viva) return;
          if ("notModified" in r) return;
          setM(r.data);
          setError(null);
        })
        .catch(() => {
          if (viva) setError("Sin métricas: reintentando cada 2 s.");
        });
    };
    pedir();
    const t = setInterval(pedir, 2000); // polling cada 2 s (RT-7)
    return () => {
      viva = false;
      clearInterval(t);
    };
  }, []);

  const g = m?.global;
  const ahorro = g && g.cifraIngenua > 0 ? (1 - g.mensajesEmitidosTotal / g.cifraIngenua) * 100 : 0;

  return (
    <>
      <header className="topbar">
        <strong>Operación</strong>
        <span className={`pill ${error ? "warn" : "live"}`}>{error ? "reintentando" : "en vivo · 2 s"}</span>
        <span className="meta mono">instancia {instancia}</span>
      </header>
      <main className="col">
        <h1>Tablero de operación</h1>
        <p className="sub">Prueba de carga y pico de la jornada. {error ?? "Métricas cada 2 segundos."}</p>
        <div className="grid">
          <section className="card" aria-label="Global">
            <h2>Global</h2>
            <dl className="kv">
              <span><dt>Conexiones totales</dt><dd className="mono">{g ? fmtInt.format(g.conexionesTotales) : "…"}</dd></span>
              <span><dt>Actas por minuto</dt><dd className="mono">{g ? fmtInt.format(g.actasPorMinuto) : "…"}</dd></span>
              <span><dt>Retraso publicación</dt><dd className="mono">{g ? `${fmtInt.format(g.retrasoPublicacion)} ms` : "…"}</dd></span>
            </dl>
          </section>
          <section className="card" aria-label="Agregación del fan-out">
            <h2>Mensajes emitidos frente a cifra ingenua</h2>
            <p className="cap">Un mensaje por acta y por cliente serían {g ? fmtInt.format(g.cifraIngenua) : "…"} envíos.</p>
            <dl className="kv">
              <span><dt>Emitidos</dt><dd className="mono">{g ? fmtInt.format(g.mensajesEmitidosTotal) : "…"}</dd></span>
              <span><dt>Ahorro por agregación</dt><dd className="mono">{g ? `${ahorro.toFixed(1)} %` : "…"}</dd></span>
            </dl>
          </section>
        </div>
        <section className="card" aria-label="Por instancia">
          <h2>Por instancia ({m?.instancias.length ?? 0})</h2>
          {(m?.instancias.length ?? 0) === 0 && <p className="meta">Esperando métricas…</p>}
          <table>
            <thead>
              <tr>
                <th scope="col">Instancia</th>
                <th scope="col" className="num">Púb.</th>
                <th scope="col" className="num">Jurados</th>
                <th scope="col" className="num">Consolas</th>
                <th scope="col" className="num">Event loop p50</th>
                <th scope="col" className="num">p99</th>
                <th scope="col" className="num">máx</th>
                <th scope="col" className="num">Mem/conexión</th>
                <th scope="col" className="num">Msgs/s</th>
                <th scope="col">Redis</th>
              </tr>
            </thead>
            <tbody>
              {(m?.instancias ?? []).map((i) => (
                <tr key={i.id}>
                  <th scope="row" className="mono">{i.id}</th>
                  <td className="num mono">{fmtInt.format(i.conexionesPublicas)}</td>
                  <td className="num mono">{fmtInt.format(i.conexionesJurados)}</td>
                  <td className="num mono">{fmtInt.format(i.conexionesConsolas)}</td>
                  <td className="num mono">{fmtInt.format(i.eventLoopP50)} ms</td>
                  <td className="num mono">{fmtInt.format(i.eventLoopP99)} ms</td>
                  <td className="num mono">{fmtInt.format(i.eventLoopMax)} ms</td>
                  <td className="num mono">{fmtInt.format(i.memoriaPorConexion)} KB</td>
                  <td className="num mono">{fmtInt.format(i.mensajesPorSegundo)}</td>
                  <td><span className={`pill ${i.redis === "ok" ? "live" : "warn"}`}>{i.redis}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>
    </>
  );
}
