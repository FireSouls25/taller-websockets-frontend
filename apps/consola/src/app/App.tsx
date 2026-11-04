import { useEffect, useRef, useState, type JSX } from "react";
import {
  httpGet,
  fetchInstance,
  satisfiesTallyRule,
  type LostCaseReason,
  type MyCase,
} from "@preconteo/shared";
import { readSession, signIn, signOut, type ConsoleSession } from "../domains/auth/session.js";
import { ConsoleLink, type ConsoleView } from "../domains/verification/console-link.js";
import { es, resolvedText } from "../i18n/es.js";

const CANDIDATES = ["C1", "C2", "C3", "BLANCO", "NULO", "NO_MARCADO"];

function ago(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s} s`;
  return `${Math.floor(s / 60)} min ${s % 60} s`;
}

function lostReasonText(reason: LostCaseReason): string {
  if (reason === "idle") return es.board.lostIdle;
  if (reason === "expired") return es.board.lostExpired;
  return es.board.lostNewVersion;
}

const idleState = (): ConsoleView => ({
  connected: false,
  degraded: false,
  rev: "0-0",
  queue: [],
  cases: [],
  myCase: null,
  presence: [],
  notice: null,
  idleWarning: false,
});

export function App(): JSX.Element {
  const [session, setSession] = useState<ConsoleSession | null>(() => readSession());
  const [st, setSt] = useState<ConsoleView>(idleState);
  const [notice, setNotice] = useState<string | null>(null);
  const [instance, setInstance] = useState("…");
  const link = useRef<ConsoleLink | null>(null);

  useEffect(() => {
    void fetchInstance().then(setInstance);
  }, []);

  useEffect(() => {
    if (!session) return;
    const c = new ConsoleLink(session.token, {
      onState: (s) => {
        setSt(s);
        if (!s.connected) setNotice(es.board.offline);
        else if (s.idleWarning) setNotice(es.board.idle);
        else setNotice(null);
      },
      onResolved: (record, outcome) => setNotice(resolvedText(record, outcome)),
      onRaceLost: () => setNotice(es.board.raceLost),
      onErrorCode: (code) => setNotice(`Error: ${code}`),
      onCaseLost: (record, reason) =>
        setNotice(es.board.caseLost(record, lostReasonText(reason))),
    });
    link.current = c;
    c.start();
    return () => {
      c.stop();
      link.current = null;
    };
  }, [session]);

  if (!session) return <SignIn onEnter={setSession} />;

  return (
    <>
      <header className="topbar">
        <strong>{es.brand}</strong>
        <span className="who mono">{session.user}</span>
        <span className={`pill ${st.connected ? "live" : "neutral"}`}>
          {st.connected ? es.header.live : es.header.reconnecting}
        </span>
        <span className="meta mono">instancia {instance}</span>
        <button className="textlike" type="button" onClick={() => { link.current?.stop(); signOut(); setSession(null); }}>
          {es.header.signOut}
        </button>
      </header>
      <main className="col">
        <h1>{es.board.title}</h1>
        <p className="sub">
          {st.connected ? es.board.sub(st.queue.length, st.rev) : es.board.connecting} · {es.board.rule}
        </p>
        {st.degraded && <p className="alert" role="alert">{es.board.degraded}</p>}
        {notice && <p className="notice" role="status">{notice}</p>}
        <div className="grid">
          <section className="card" aria-label={es.board.queueTitle(st.queue.length)}>
            <h2>{es.board.queueTitle(st.queue.length)}</h2>
            {st.queue.length === 0 && <p className="meta">{es.board.queueEmpty}</p>}
            {st.queue.map((item) => {
              const holder = st.cases.find((k) => k.record === item.code);
              return (
                <div className="row" key={`${item.code}-v${item.version}`}>
                  <span className="row-data">
                    <span className="record-id mono">{item.code} · v{item.version}</span>
                    <br />
                    <span className="row-detail">
                      {item.reason} · mesa {item.table} · puesto {item.station} · mun {item.municipality}
                    </span>
                    <br />
                    {holder ? (
                      <span className="pill neutral">{es.board.takenBy(holder.auditor)}</span>
                    ) : (
                      <span className="pill live">{es.board.free}</span>
                    )}
                  </span>
                  <span className="row-action">
                    {!holder && !session.isCoordinator && (
                      <button className="btn-secondary" type="button" onClick={() => link.current?.take(item.code)}>
                        {es.board.take}
                      </button>
                    )}
                  </span>
                </div>
              );
            })}
            {!session.isCoordinator && (
              <button className="btn-primary" type="button" onClick={() => link.current?.take()}>
                {es.board.takeUrgent}
              </button>
            )}
          </section>
          <section className="card" aria-label={es.board.myCase}>
            <h2>{es.board.myCase}</h2>
            {!st.myCase && <p className="meta">{es.board.noCase}</p>}
            {st.myCase && (
              <CaseView link={link.current} token={session.token} current={st.myCase} />
            )}
          </section>
        </div>
        {session.isCoordinator && (
          <section className="card" aria-label={es.presence.title(st.presence.length)}>
            <h2>{es.presence.title(st.presence.length)}</h2>
            {st.presence.length === 0 && <p className="meta">{es.presence.empty}</p>}
            {st.presence.map((p) => (
              <div className="row" key={p.auditor}>
                <span className="row-data">
                  <span className="mono">{p.auditor}</span>{" "}
                  <span className="row-detail">{p.info.role} · {p.info.instance}</span>
                  <br />
                  <span className="row-detail">
                    {p.record
                      ? es.presence.working(p.record, p.since ? ago(Date.now() - p.since) : "…")
                      : es.presence.noCase}
                    {" · "}
                    {es.presence.connected(ago(Date.now() - p.info.connectedSince))}
                    {" · "}
                    {es.presence.lastActivity(ago(Date.now() - p.info.lastActivity))}
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

function CaseView({ link, token, current }: { link: ConsoleLink | null; token: string; current: MyCase }): JSX.Element {
  const [decision, setDecision] = useState<"APROBAR" | "RECHAZAR" | "CORREGIR">("APROBAR");
  const [votes, setVotes] = useState<Record<string, string>>(() =>
    Object.fromEntries(CANDIDATES.map((c) => [c, String(current.detail.votes[c] ?? "")])),
  );
  const [voters, setVoters] = useState(String(current.detail.voters));
  const [history, setHistory] = useState<
    { state: "loading" } | { state: "error" } | { state: "ready"; events: Array<{ tipo: string; version: number }> }
  >({ state: "loading" });
  const nums: Record<string, number> = Object.fromEntries(CANDIDATES.map((c) => [c, Number(votes[c] || 0)]));
  const balanced = satisfiesTallyRule(nums, Number(voters || 0));

  useEffect(() => {
    setHistory({ state: "loading" });
    void httpGet<{ acta: string; eventos: Array<{ tipo: string; version: number }> }>(
      `/api/actas/${encodeURIComponent(current.record)}/historial`,
      { token },
    )
      .then((r) => {
        if (!("notModified" in r)) setHistory({ state: "ready", events: r.data.eventos });
      })
      .catch(() => setHistory({ state: "error" }));
  }, [current.record, token]);

  return (
    <div>
      <p><span className="mono">{current.record}</span> <span className="pill warn">{current.detail.reason}</span></p>
      <dl className="kv">
        {CANDIDATES.map((c) => (
          <span key={c}><dt>{c}</dt><dd className="mono">{current.detail.votes[c] ?? 0}</dd></span>
        ))}
        <span><dt>{es.decision.voters}</dt><dd className="mono">{current.detail.voters}</dd></span>
      </dl>
      <h3>{es.history.title}</h3>
      {history.state === "error" && <p className="meta">{es.history.error}</p>}
      {history.state === "loading" && <p className="meta">{es.history.loading}</p>}
      {history.state === "ready" && history.events.length === 0 && <p className="meta">{es.history.empty}</p>}
      {history.state === "ready" && history.events.length > 0 && (
        <ul className="history">
          {history.events.map((h, i) => (
            <li key={i} className="mono">{h.tipo} · v{h.version}</li>
          ))}
        </ul>
      )}
      <label className="field" htmlFor="decision">{es.decision.label}</label>
      <select id="decision" value={decision} onChange={(e) => setDecision(e.target.value as typeof decision)}>
        <option value="APROBAR">{es.decision.approve}</option>
        <option value="RECHAZAR">{es.decision.reject}</option>
        <option value="CORREGIR">{es.decision.correct}</option>
      </select>
      {decision === "CORREGIR" && (
        <>
          <div className="form-grid">
            {CANDIDATES.map((c) => (
              <span key={c}>
                <label className="field" htmlFor={`c-${c}`}>{c}</label>
                <input id={`c-${c}`} className="mono" inputMode="numeric" value={votes[c]} onChange={(e) => setVotes({ ...votes, [c]: e.target.value })} />
              </span>
            ))}
          </div>
          <label className="field" htmlFor="c-voters">{es.decision.voters}</label>
          <input id="c-voters" className="mono" inputMode="numeric" value={voters} onChange={(e) => setVoters(e.target.value)} />
          {!balanced && <p className="alert" role="alert">{es.decision.mustBalance}</p>}
        </>
      )}
      <div className="actions">
        <button
          className="btn-primary"
          type="button"
          disabled={decision === "CORREGIR" && !balanced}
          onClick={() => link?.resolve(decision, decision === "CORREGIR" ? nums : undefined, decision === "CORREGIR" ? Number(voters) : undefined)}
        >
          {es.decision.resolve}
        </button>
        <button className="btn-secondary" type="button" onClick={() => link?.release()}>{es.decision.release}</button>
      </div>
    </div>
  );
}

function SignIn({ onEnter }: { onEnter: (s: ConsoleSession) => void }): JSX.Element {
  const [user, setUser] = useState("AUD-014");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <main className="col">
      <h1>{es.signIn.title}</h1>
      <p className="sub">{es.signIn.sub}</p>
      <section className="card">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            void signIn(user.trim(), password).then(onEnter).catch((err: unknown) => {
              const code = (err as { code?: string }).code;
              if (code === "CREDENCIALES_INVALIDAS") setError(es.signIn.badCredentials);
              else if (code === "LIMITE_TASA") setError(es.signIn.rateLimited);
              else setError(err instanceof Error ? err.message : es.signIn.failed);
            });
          }}
        >
          <label className="field" htmlFor="u">{es.signIn.user}</label>
          <input id="u" className="mono" value={user} onChange={(e) => setUser(e.target.value)} autoComplete="username" />
          <label className="field" htmlFor="c">{es.signIn.password}</label>
          <input id="c" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          {error && <p className="alert" role="alert">{error}</p>}
          <button className="btn-primary" type="submit">{es.signIn.action}</button>
        </form>
      </section>
    </main>
  );
}
