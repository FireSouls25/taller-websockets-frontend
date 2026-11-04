import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import {
  cumpleReglaContable,
  nuevoIdem,
  obtenerInstancia,
  sha256Hex,
  type Acta,
} from "@preconteo/shared";
import { cerrarSesion, iniciarSesion, leerSesion, type Sesion } from "../domains/auth/sesion.js";
import { MotorEnvio } from "../domains/actas/motor-envio.js";
import type { RegistroCola } from "../domains/actas/cola-store.js";

const CANDIDATOS = ["C1", "C2", "C3", "BLANCO", "NULO", "NO_MARCADO"];

interface Borrador {
  acta: string;
  mesa: string;
  puesto: string;
  municipio: string;
  version: string;
  votos: Record<string, string>;
  sufragantes: string;
}

const borradorVacio = (): Borrador => ({
  acta: "",
  mesa: "",
  puesto: "",
  municipio: "",
  version: "1",
  votos: Object.fromEntries(CANDIDATOS.map((c) => [c, ""])),
  sufragantes: "",
});

function estadoPildora(r: RegistroCola): { clase: string; texto: string } {
  switch (r.estado) {
    case "guardada":
      return { clase: "neutral", texto: "guardada localmente" };
    case "enviando":
      return { clase: "warn", texto: r.ultimoError ? `enviando · ${r.ultimoError}` : "enviando" };
    case "registrada":
      return { clase: "live", texto: "registrada" };
    case "en-revision":
      return { clase: "warn", texto: "en revisión" };
    case "rechazada":
      return { clase: "bad", texto: r.ultimoError ?? "rechazada" };
  }
}

export function App(): JSX.Element {
  const [sesion, setSesion] = useState<Sesion | null>(() => leerSesion());
  const [cola, setCola] = useState<RegistroCola[]>([]);
  const [conexion, setConexion] = useState("conectando");
  const [aviso, setAviso] = useState<string | null>(null);
  const [instancia, setInstancia] = useState("…");
  const [borrador, setBorrador] = useState<Borrador>(borradorVacio);
  const [foto, setFoto] = useState<Blob | null>(null);
  const [hashFoto, setHashFoto] = useState("");
  const [errorForm, setErrorForm] = useState<string | null>(null);
  const motor = useRef<MotorEnvio | null>(null);

  useEffect(() => {
    void obtenerInstancia().then(setInstancia);
  }, []);

  useEffect(() => {
    if (!sesion) return;
    const m = new MotorEnvio(sesion.token, {
      onCola: setCola,
      onConexion: setConexion,
      onAviso: setAviso,
    });
    motor.current = m;
    m.arrancar();
    return () => {
      m.detener();
      motor.current = null;
    };
  }, [sesion]);

  const votosNum = useMemo(() => {
    const o: Record<string, number> = {};
    for (const c of CANDIDATOS) o[c] = Number(borrador.votos[c] || 0);
    return o;
  }, [borrador]);
  const cuadra = cumpleReglaContable(votosNum, Number(borrador.sufragantes || 0));

  if (!sesion) {
    return (
      <Acceso
        onEntrar={(s) => {
          setSesion(s);
        }}
      />
    );
  }

  const enviar = async (ev: React.FormEvent): Promise<void> => {
    ev.preventDefault();
    setErrorForm(null);
    const acta: Acta = {
      acta: borrador.acta.trim(),
      mesa: Number(borrador.mesa),
      puesto: Number(borrador.puesto),
      municipio: Number(borrador.municipio),
      version: Number(borrador.version || 1),
      jurado: sesion.usuario,
      ts_cierre: Math.floor(Date.now() / 1000),
      votos: votosNum,
      sufragantes: Number(borrador.sufragantes),
      hash_foto: hashFoto || "sin-foto",
      idem: nuevoIdem(), // UNA vez por envío; los reintentos lo reutilizan
    };
    if (!acta.acta || !acta.mesa || !acta.puesto || !acta.municipio) {
      setErrorForm("Faltan acta, mesa, puesto o municipio.");
      return;
    }
    await motor.current?.encolar(acta, foto);
    setBorrador(borradorVacio());
    setFoto(null);
    setHashFoto("");
  };

  const corregir = (r: RegistroCola): void => {
    // Corrección: mismo acta, versión + 1, idem NUEVO. Pueden convivir versiones.
    setBorrador({
      acta: r.acta.acta,
      mesa: String(r.acta.mesa),
      puesto: String(r.acta.puesto),
      municipio: String(r.acta.municipio),
      version: String(r.acta.version + 1),
      votos: Object.fromEntries(CANDIDATOS.map((c) => [c, String(r.acta.votos[c] ?? "")])),
      sufragantes: String(r.acta.sufragantes),
    });
    window.scrollTo({ top: 0 });
  };

  return (
    <>
      <header className="topbar">
        <strong>Jurado</strong>
        <span className="quien mono">{sesion.usuario}</span>
        <span className={`pill ${conexion === "abierto" ? "live" : conexion === "en-espera" ? "warn" : "neutral"}`}>
          {conexion === "abierto" ? "en vivo" : conexion === "en-espera" ? "en espera" : "reconectando…"}
        </span>
        <button className="texto" type="button" onClick={() => { motor.current?.detener(); cerrarSesion(); setSesion(null); }}>
          Salir
        </button>
      </header>
      <main className="col">
        <h1>Transmitir acta</h1>
        <p className="sub">
          El acta queda guardada en este teléfono antes de enviarse. Sin confirmación no hay registro:
          si se corta la red, se reintenta sola. Instancia {instancia}.
        </p>
        {aviso && <p className="aviso" role="status">{aviso}</p>}
        <section className="card" aria-label="Formulario del acta">
          <h2>Acta {borrador.version !== "1" && <span className="pill warn">corrección v{borrador.version}</span>}</h2>
          <form onSubmit={(e) => void enviar(e)}>
            <div className="rejilla">
              <span>
                <label className="campo" htmlFor="f-acta">Acta</label>
                <input id="f-acta" className="mono" value={borrador.acta} onChange={(e) => setBorrador({ ...borrador, acta: e.target.value })} placeholder="E14-176-0042-03" />
              </span>
              <span>
                <label className="campo" htmlFor="f-version">Versión</label>
                <input id="f-version" className="mono" inputMode="numeric" value={borrador.version} onChange={(e) => setBorrador({ ...borrador, version: e.target.value })} />
              </span>
              <span>
                <label className="campo" htmlFor="f-mesa">Mesa</label>
                <input id="f-mesa" className="mono" inputMode="numeric" value={borrador.mesa} onChange={(e) => setBorrador({ ...borrador, mesa: e.target.value })} />
              </span>
              <span>
                <label className="campo" htmlFor="f-puesto">Puesto</label>
                <input id="f-puesto" className="mono" inputMode="numeric" value={borrador.puesto} onChange={(e) => setBorrador({ ...borrador, puesto: e.target.value })} />
              </span>
              <span>
                <label className="campo" htmlFor="f-mun">Municipio</label>
                <input id="f-mun" className="mono" inputMode="numeric" value={borrador.municipio} onChange={(e) => setBorrador({ ...borrador, municipio: e.target.value })} />
              </span>
              <span>
                <label className="campo" htmlFor="f-suf">Sufragantes</label>
                <input id="f-suf" className="mono" inputMode="numeric" value={borrador.sufragantes} onChange={(e) => setBorrador({ ...borrador, sufragantes: e.target.value })} />
              </span>
            </div>
            <h2 style={{ marginTop: 16 }}>Votos</h2>
            <div className="rejilla">
              {CANDIDATOS.map((c) => (
                <span key={c}>
                  <label className="campo" htmlFor={`v-${c}`}>{c}</label>
                  <input id={`v-${c}`} className="mono" inputMode="numeric" value={borrador.votos[c]} onChange={(e) => setBorrador({ ...borrador, votos: { ...borrador.votos, [c]: e.target.value } })} />
                </span>
              ))}
            </div>
            {!cuadra && borrador.sufragantes !== "" && (
              <p className="alerta" role="alert">
                La suma de votos no coincide con sufragantes: el acta irá a verificación humana. Puedes enviarla igual.
              </p>
            )}
            <label className="campo" htmlFor="f-foto">Foto del acta</label>
            <input
              id="f-foto"
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setFoto(f);
                if (f) {
                  void f.arrayBuffer().then((b) => sha256Hex(b).then(setHashFoto));
                } else {
                  setHashFoto("");
                }
              }}
            />
            {hashFoto !== "" && <p className="hash mono">sha256 {hashFoto.slice(0, 32)}… (se conserva en el teléfono)</p>}
            {errorForm && <p className="alerta" role="alert">{errorForm}</p>}
            <button className="primario" type="submit">Guardar y enviar</button>
          </form>
        </section>
        <section className="card" aria-label="Cola de envío">
          <h2>En este teléfono ({cola.length})</h2>
          {cola.length === 0 && <p className="meta">Sin actas pendientes. Todo lo enviado y confirmado sale de aquí.</p>}
          {cola.map((r) => {
            const p = estadoPildora(r);
            return (
              <div className="fila-cola" key={r.idem}>
                <span className="datos">
                  <span className="acta-id">{r.acta.acta} · v{r.acta.version}</span>
                  <br />
                  <span className={`pill ${p.clase}`}>{p.texto}</span>{" "}
                  <span className="detalle">intentos {r.intentos}</span>
                </span>
                <span className="accion">
                  <button className="secundario" type="button" onClick={() => corregir(r)}>Corregir</button>
                </span>
              </div>
            );
          })}
        </section>
      </main>
    </>
  );
}

function Acceso({ onEntrar }: { onEntrar: (s: Sesion) => void }): JSX.Element {
  const [usuario, setUsuario] = useState("JUR-88134");
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <main className="col">
      <h1>Ingreso de jurado</h1>
      <p className="sub">Usa tu código JUR- y tu clave.</p>
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
