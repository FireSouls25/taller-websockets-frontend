import { useEffect, useRef, useState, type JSX } from "react";
import { cumpleReglaContable, obtenerInstancia } from "@preconteo/shared";
import { cerrarSesion, iniciarSesion, leerSesion, type SesionConsola } from "../domains/auth/sesion.js";
import { ConexionConsola, type EstadoConsola } from "../domains/verificacion/conexion-consola.js";

const CANDIDATOS = ["C1", "C2", "C3", "BLANCO", "NULO", "NO_MARCADO"];

function hace(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s} s`;
  return `${Math.floor(s / 60)} min ${s % 60} s`;
}

export function App(): JSX.Element {
  const [sesion, setSesion] = useState<SesionConsola | null>(() => leerSesion());
  const [st, setSt] = useState<EstadoConsola | null>(null);
  const [instancia, setInstancia] = useState("…");
  const con = useRef<ConexionConsola | null>(null);

  useEffect(() => {
    void obtenerInstancia().then(setInstancia);
  }, []);

  useEffect(() => {
    if (!sesion) return;
    const c = new ConexionConsola(sesion.token, { onEstado: setSt });
    con.current = c;
    c.arrancar();
    return () => {
      c.detener();
      con.current = null;
    };
  }, [sesion]);

  if (!sesion) return <Acceso onEntrar={setSesion} />;

  return (
    <>
      <header className="topbar">
        <strong>Verificación</strong>
        <span className="quien mono">{sesion.usuario}</span>
        <span className={`pill ${st?.conectada ? "live" : "neutral"}`}>{st?.conectada ? "en vivo" : "reconectando…"}</span>
        <span className="meta mono">instancia {instancia}</span>
        <button className="texto" type="button" onClick={() => { con.current?.detener(); cerrarSesion(); setSesion(null); }}>
          Salir
        </button>
      </header>
      <main className="col">
        <h1>Cola de verificación</h1>
        <p className="sub">
          {st ? `${st.cola.length} en cola · rev ${st.rev}` : "Conectando…"} · un acta, un auditor.
        </p>
        {st?.degradado && <p className="alerta" role="alert">Sistema degradado: trabaja con calma, los cambios pueden tardar.</p>}
        {st?.aviso && <p className="aviso" role="status">{st.aviso}</p>}
        {st?.avisoInactividad && <p className="alerta" role="alert">Inactivo: tu caso vuelve a la cola en menos de un minuto.</p>}
        <div className="grid">
          <section className="card" aria-label="Cola">
            <h2>Cola ({st?.cola.length ?? 0})</h2>
            {(st?.cola.length ?? 0) === 0 && <p className="meta">Cola vacía. Todo revisado.</p>}
            {st?.cola.map((c) => {
              const tomadoPor = st.casos.find((k) => k.acta === c.acta);
              return (
                <div className="fila" key={`${c.acta}-v${c.version}`}>
                  <span className="datos">
                    <span className="acta-id mono">{c.acta} · v{c.version}</span>
                    <br />
                    <span className="detalle">{c.motivo} · mesa {c.mesa} · puesto {c.puesto} · mun {c.municipio}</span>
                    <br />
                    {tomadoPor ? (
                      <span className="pill neutral">en {tomadoPor.auditor}</span>
                    ) : (
                      <span className="pill live">libre</span>
                    )}
                  </span>
                  <span className="accion">
                    {!tomadoPor && (
                      <button className="secundario" type="button" onClick={() => con.current?.tomar(c.acta)}>
                        Tomar
                      </button>
                    )}
                  </span>
                </div>
              );
            })}
            <button className="primario" type="button" onClick={() => con.current?.tomar()}>
              Tomar la más urgente
            </button>
          </section>
          <section className="card" aria-label="Mi caso">
            <h2>Mi caso</h2>
            {!st?.miCaso && <p className="meta">Sin caso. Toma uno de la cola.</p>}
            {st?.miCaso && <Caso con={con.current} acta={st.miCaso.acta} detalle={st.miCaso.detalle} />}
          </section>
        </div>
        {sesion.esCoord && (
          <section className="card" aria-label="Presencia">
            <h2>Presencia ({st?.presencia.length ?? 0})</h2>
            {(st?.presencia.length ?? 0) === 0 && <p className="meta">Nadie conectado.</p>}
            {st?.presencia.map((p) => (
              <div className="fila" key={p.auditor}>
                <span className="datos">
                  <span className="mono">{p.auditor}</span> <span className="detalle">{p.info}</span>
                  <br />
                  <span className="detalle">
                    {p.acta ? `en ${p.acta} desde hace ${p.desde ? hace(Date.now() - p.desde) : "…"}` : "sin caso"}
                  </span>
                </span>
              </div>
            ))}
          </section>
        )}
      </main>
    </>
  );
}

function Caso({ con, acta, detalle }: { con: ConexionConsola | null; acta: string; detalle: { motivo: string; votos: Record<string, number>; sufragantes: number; version: number } }): JSX.Element {
  const [decision, setDecision] = useState<"APROBAR" | "RECHAZAR" | "CORREGIR">("APROBAR");
  const [votos, setVotos] = useState<Record<string, string>>(() =>
    Object.fromEntries(CANDIDATOS.map((c) => [c, String(detalle.votos[c] ?? "")])),
  );
  const [suf, setSuf] = useState(String(detalle.sufragantes));
  const nums: Record<string, number> = Object.fromEntries(CANDIDATOS.map((c) => [c, Number(votos[c] || 0)]));
  const cuadra = cumpleReglaContable(nums, Number(suf || 0));

  return (
    <div>
      <p><span className="mono">{acta}</span> <span className="pill warn">{detalle.motivo}</span></p>
      <dl className="kv">
        {CANDIDATOS.map((c) => (
          <span key={c}><dt>{c}</dt><dd className="mono">{detalle.votos[c] ?? 0}</dd></span>
        ))}
        <span><dt>Sufragantes</dt><dd className="mono">{detalle.sufragantes}</dd></span>
      </dl>
      <label className="campo" htmlFor="decision">Decisión</label>
      <select id="decision" value={decision} onChange={(e) => setDecision(e.target.value as typeof decision)}>
        <option value="APROBAR">Aprobar</option>
        <option value="RECHAZAR">Rechazar</option>
        <option value="CORREGIR">Corregir valores</option>
      </select>
      {decision === "CORREGIR" && (
        <>
          <div className="rejilla">
            {CANDIDATOS.map((c) => (
              <span key={c}>
                <label className="campo" htmlFor={`c-${c}`}>{c}</label>
                <input id={`c-${c}`} className="mono" inputMode="numeric" value={votos[c]} onChange={(e) => setVotos({ ...votos, [c]: e.target.value })} />
              </span>
            ))}
          </div>
          <label className="campo" htmlFor="c-suf">Sufragantes</label>
          <input id="c-suf" className="mono" inputMode="numeric" value={suf} onChange={(e) => setSuf(e.target.value)} />
          {!cuadra && <p className="alerta" role="alert">La corrección debe cuadrar: suma de votos igual a sufragantes.</p>}
        </>
      )}
      <div className="botones">
        <button
          className="primario"
          type="button"
          disabled={decision === "CORREGIR" && !cuadra}
          onClick={() => con?.resolver(decision, decision === "CORREGIR" ? nums : undefined, decision === "CORREGIR" ? Number(suf) : undefined)}
        >
          Resolver
        </button>
        <button className="secundario" type="button" onClick={() => con?.liberar()}>Liberar</button>
      </div>
    </div>
  );
}

function Acceso({ onEntrar }: { onEntrar: (s: SesionConsola) => void }): JSX.Element {
  const [usuario, setUsuario] = useState("AUD-014");
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <main className="col">
      <h1>Ingreso de auditoría</h1>
      <p className="sub">Cuentas AUD- o COORD-.</p>
      <section className="card">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            void iniciarSesion(usuario.trim(), clave).then(onEntrar).catch((err: unknown) => {
              setError(err instanceof Error ? err.message : "No se pudo ingresar");
            });
          }}
        >
          <label className="campo" htmlFor="u">Usuario</label>
          <input id="u" className="mono" value={usuario} onChange={(e) => setUsuario(e.target.value)} autoComplete="username" />
          <label className="campo" htmlFor="c">Clave</label>
          <input id="c" type="password" value={clave} onChange={(e) => setClave(e.target.value)} autoComplete="current-password" />
          {error && <p className="alerta" role="alert">{error}</p>}
          <button className="primario" type="submit">Ingresar</button>
        </form>
      </section>
    </main>
  );
}
