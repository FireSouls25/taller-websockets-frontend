import { useEffect, useState, type JSX } from "react";
import { fetchInstance, fromWireMetrics, httpGet, type OperationMetrics, type OperationMetricsWire } from "@preconteo/shared";
import { es } from "../i18n/es.js";

const fmtInt = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });

export function App(): JSX.Element {
  const [metrics, setMetrics] = useState<OperationMetrics | null>(null);
  const [instance, setInstance] = useState("…");
  const [degraded, setDegraded] = useState(false);

  useEffect(() => {
    void fetchInstance().then(setInstance);
    let alive = true;
    const poll = (): void => {
      void httpGet<OperationMetricsWire>("/api/ops/metrics")
        .then((r) => {
          if (!alive || "notModified" in r) return;
          setMetrics(fromWireMetrics(r.data));
          setDegraded(false);
        })
        .catch((e: unknown) => {
          // 503 with { global: null, instancias: [this one] } while Redis is down.
          const data = (e as { data?: OperationMetricsWire }).data;
          if (!alive || !data) return;
          try {
            setMetrics(fromWireMetrics(data));
            setDegraded(true);
          } catch {
            /* unparsable: keep previous frame */
          }
        });
    };
    poll();
    const t = setInterval(poll, 2000); // polling every 2 s (RT-7)
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const g = metrics?.global ?? null;

  return (
    <>
      <header className="topbar">
        <strong>{es.brand}</strong>
        <span className={`pill ${degraded ? "warn" : "live"}`}>
          {degraded ? es.retrying : es.live}
        </span>
        <span className="meta mono">instancia {instance}</span>
      </header>
      <main className="col">
        <h1>{es.title}</h1>
        <p className="sub">{es.sub(degraded ? es.degraded : null)}</p>
        <div className="grid">
          <section className="card" aria-label={es.global.title}>
            <h2>{es.global.title}</h2>
            <dl className="kv">
              <span><dt>{es.global.liveInstances}</dt><dd className="mono">{g ? fmtInt.format(g.liveInstances) : "…"}</dd></span>
              <span><dt>{es.global.publicConnections}</dt><dd className="mono">{g ? fmtInt.format(g.publicConnections) : "…"}</dd></span>
              <span><dt>{es.global.recordsPerMinute}</dt><dd className="mono">{g ? fmtInt.format(g.recordsPerMinute) : "…"}</dd></span>
              <span><dt>{es.global.publishLag}</dt><dd className="mono">{g ? es.ms(g.publishLagMs) : "…"}</dd></span>
              <span><dt>{es.global.emitted}</dt><dd className="mono">{g ? fmtInt.format(g.totalEmitted) : "…"}</dd></span>
              <span><dt>{es.global.naive}</dt><dd className="mono">{g ? fmtInt.format(g.naiveEstimate) : "…"}</dd></span>
              <span><dt>{es.global.reduction}</dt><dd className="mono">{g ? `×${fmtInt.format(g.reductionFactor)}` : "…"}</dd></span>
            </dl>
          </section>
          <section className="card" aria-label={es.backpressure.title}>
            <h2>{es.backpressure.title}</h2>
            {(metrics?.instances.length ?? 0) === 0 && <p className="meta">…</p>}
            {(metrics?.instances ?? []).map((i) => (
              <div className="row" key={i.id}>
                <span className="mono">{i.id}</span>{" "}
                <span className={`pill ${i.backpressure.lagging > 0 ? "warn" : "live"}`}>
                  {i.backpressure.lagging} {es.backpressure.lagging}
                </span>{" "}
                <span className="pill neutral">{i.backpressure.ejected} {es.backpressure.ejected}</span>{" "}
                <span className="pill neutral">{i.backpressure.rejectedIntake} {es.backpressure.rejectedIntake}</span>
                <br />
                <span className={`pill ${i.redisHealthy ? "live" : "warn"}`}>
                  {i.redisHealthy ? es.backpressure.redisOk : es.backpressure.redisDown}
                </span>{" "}
                <span className={`pill ${i.postgresOk ? "live" : "warn"}`}>
                  {i.postgresOk ? es.backpressure.postgresOk : es.backpressure.postgresDown}
                </span>
              </div>
            ))}
          </section>
        </div>
        <section className="card" aria-label={es.instances.title(metrics?.instances.length ?? 0)}>
          <h2>{es.instances.title(metrics?.instances.length ?? 0)}</h2>
          {(metrics?.instances.length ?? 0) === 0 && <p className="meta">{es.instances.waiting}</p>}
          <table>
            <thead>
              <tr>
                <th scope="col">{es.instances.instance}</th>
                <th scope="col" className="num">{es.instances.connections}</th>
                <th scope="col" className="num">{es.instances.eventLoop}</th>
                <th scope="col" className="num">{es.instances.memory}</th>
                <th scope="col" className="num">{es.instances.messages}</th>
                <th scope="col" className="num">{es.instances.records}</th>
                <th scope="col" className="num">{es.instances.audits}</th>
              </tr>
            </thead>
            <tbody>
              {(metrics?.instances ?? []).map((i) => (
                <tr key={i.id}>
                  <th scope="row" className="mono">{i.id}</th>
                  <td className="num mono">
                    {fmtInt.format(i.connections.public)}/{fmtInt.format(i.connections.jurors)}/{fmtInt.format(i.connections.consoles)}
                  </td>
                  <td className="num mono">
                    {i.eventLoopMs.p50}/{i.eventLoopMs.p99}/{i.eventLoopMs.max} ms
                  </td>
                  <td className="num mono">
                    {i.memory.rssMb}/{i.memory.heapMb}/{i.memory.kbPerConnection} KB
                  </td>
                  <td className="num mono">
                    {fmtInt.format(i.messages.emitted)}/{fmtInt.format(i.messages.perSecond)}
                  </td>
                  <td className="num mono">
                    {fmtInt.format(i.recordsPerMinute)} · {i.publishLagMs} ms
                  </td>
                  <td className="num mono">{fmtInt.format(i.savedAudits)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>
    </>
  );
}
