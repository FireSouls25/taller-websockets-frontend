import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import {
  expectedRecordCode,
  isCoherentHierarchy,
  newIdem,
  fetchInstance,
  satisfiesTallyRule,
  sha256Hex,
  type TallySheet,
} from "@preconteo/shared";
import { readSession, signIn, signOut, type Session } from "../domains/auth/session.js";
import { SendEngine, type QueueView } from "../domains/tally/send-engine.js";
import { ackText, es } from "../i18n/es.js";

const CANDIDATES = ["C1", "C2", "C3", "BLANCO", "NULO", "NO_MARCADO"];

interface Draft {
  code: string;
  table: string;
  station: string;
  municipality: string;
  version: string;
  votes: Record<string, string>;
  voters: string;
}

const emptyDraft = (): Draft => ({
  code: "",
  table: "",
  station: "",
  municipality: "",
  version: "1",
  votes: Object.fromEntries(CANDIDATES.map((c) => [c, ""])),
  voters: "",
});

function pillForStatus(item: QueueView[number]): { tone: string; text: string } {
  switch (item.status) {
    case "stored":
      return { tone: "neutral", text: es.queue.status.stored };
    case "sending":
      return {
        tone: "warn",
        text: item.lastError ? es.queue.status.sendingWithError(item.lastError) : es.queue.status.sending,
      };
    case "registered":
      return { tone: "live", text: es.queue.status.registered };
    case "in-review":
      return { tone: "warn", text: es.queue.status.inReview };
    case "rejected":
      return { tone: "bad", text: item.lastError ?? es.queue.status.registered };
  }
}

export function App(): JSX.Element {
  const [session, setSession] = useState<Session | null>(() => readSession());
  const [queue, setQueue] = useState<QueueView>([]);
  const [connection, setConnection] = useState("connecting");
  const [notice, setNotice] = useState<string | null>(null);
  const [instance, setInstance] = useState("…");
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [photoHash, setPhotoHash] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const engine = useRef<SendEngine | null>(null);

  useEffect(() => {
    void fetchInstance().then(setInstance);
  }, []);

  useEffect(() => {
    if (!session) return;
    const eng = new SendEngine(
      session.token,
      { onQueue: setQueue, onConnection: setConnection, onNotice: setNotice },
      {
        ackNotice: ackText,
        degradedNotice: es.degradedNotice,
        recordState: es.recordState,
        invalidSession: es.queue.invalidSession,
      },
    );
    engine.current = eng;
    eng.start();
    return () => {
      eng.stop();
      engine.current = null;
    };
  }, [session]);

  const votesNum = useMemo(() => {
    const o: Record<string, number> = {};
    for (const c of CANDIDATES) o[c] = Number(draft.votes[c] || 0);
    return o;
  }, [draft]);
  const balanced = satisfiesTallyRule(votesNum, Number(draft.voters || 0));
  const tableNum = Number(draft.table || 0);
  const stationNum = Number(draft.station || 0);
  const municipalityNum = Number(draft.municipality || 0);
  const hierarchyFilled = draft.table !== "" && draft.station !== "" && draft.municipality !== "";
  const coherent = !hierarchyFilled || isCoherentHierarchy(tableNum, stationNum, municipalityNum);
  const codeMatches =
    draft.table === "" || draft.code.trim() === "" || draft.code.trim() === expectedRecordCode(tableNum);

  if (!session) {
    return <SignIn onEnter={setSession} />;
  }

  const submit = async (ev: React.FormEvent): Promise<void> => {
    ev.preventDefault();
    setFormError(null);
    const sheet: TallySheet = {
      code: draft.code.trim(),
      table: Number(draft.table),
      station: Number(draft.station),
      municipality: Number(draft.municipality),
      version: Number(draft.version || 1),
      juror: session.user,
      closedAt: Math.floor(Date.now() / 1000),
      votes: votesNum,
      voters: Number(draft.voters),
      photoHash: photoHash || es.form.noPhoto,
      idem: newIdem(), // ONCE per submission; retries reuse it
    };
    if (!sheet.code || !sheet.table || !sheet.station || !sheet.municipality) {
      setFormError(es.form.missing);
      return;
    }
    await engine.current?.enqueue(sheet, photo);
    setDraft(emptyDraft());
    setPhoto(null);
    setPhotoHash("");
  };

  const startCorrection = (item: QueueView[number]): void => {
    // Correction: same record, version + 1, NEW idem. Versions may coexist.
    setDraft({
      code: item.sheet.code,
      table: String(item.sheet.table),
      station: String(item.sheet.station),
      municipality: String(item.sheet.municipality),
      version: String(item.sheet.version + 1),
      votes: Object.fromEntries(CANDIDATES.map((c) => [c, String(item.sheet.votes[c] ?? "")])),
      voters: String(item.sheet.voters),
    });
    window.scrollTo({ top: 0 });
  };

  return (
    <>
      <header className="topbar">
        <strong>{es.brand}</strong>
        <span className="who mono">{session.user}</span>
        <span className={`pill ${connection === "open" ? "live" : connection === "on-hold" ? "warn" : "neutral"}`}>
          {connection === "open" ? es.header.live : connection === "on-hold" ? es.header.onHold : es.header.reconnecting}
        </span>
        <button className="btn-text" type="button" onClick={() => { engine.current?.stop(); signOut(); setSession(null); }}>
          {es.header.signOut}
        </button>
      </header>
      <main className="col">
        <h1>{es.intro.title}</h1>
        <p className="sub">{es.intro.sub(instance)}</p>
        {notice && <p className="notice" role="status">{notice}</p>}
        <section className="card" aria-label={es.form.title}>
          <h2>{es.form.title} {draft.version !== "1" && <span className="pill warn">{es.form.correctionBadge(draft.version)}</span>}</h2>
          <form onSubmit={(e) => void submit(e)}>
            <div className="form-grid">
              <span>
                <label className="field" htmlFor="f-code">{es.form.record}</label>
                <input id="f-code" className="mono" value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} placeholder={es.form.recordPlaceholder} />
              </span>
              <span>
                <label className="field" htmlFor="f-version">{es.form.version}</label>
                <input id="f-version" className="mono" inputMode="numeric" value={draft.version} onChange={(e) => setDraft({ ...draft, version: e.target.value })} />
              </span>
              <span>
                <label className="field" htmlFor="f-table">{es.form.table}</label>
                <input id="f-table" className="mono" inputMode="numeric" value={draft.table} onChange={(e) => setDraft({ ...draft, table: e.target.value })} />
              </span>
              <span>
                <label className="field" htmlFor="f-station">{es.form.station}</label>
                <input id="f-station" className="mono" inputMode="numeric" value={draft.station} onChange={(e) => setDraft({ ...draft, station: e.target.value })} />
              </span>
              <span>
                <label className="field" htmlFor="f-municipality">{es.form.municipality}</label>
                <input id="f-municipality" className="mono" inputMode="numeric" value={draft.municipality} onChange={(e) => setDraft({ ...draft, municipality: e.target.value })} />
              </span>
              <span>
                <label className="field" htmlFor="f-voters">{es.form.voters}</label>
                <input id="f-voters" className="mono" inputMode="numeric" value={draft.voters} onChange={(e) => setDraft({ ...draft, voters: e.target.value })} />
              </span>
            </div>
            <h2 style={{ marginTop: 16 }}>{es.form.votesTitle}</h2>
            <div className="form-grid">
              {CANDIDATES.map((c) => (
                <span key={c}>
                  <label className="field" htmlFor={`v-${c}`}>{c}</label>
                  <input id={`v-${c}`} className="mono" inputMode="numeric" value={draft.votes[c]} onChange={(e) => setDraft({ ...draft, votes: { ...draft.votes, [c]: e.target.value } })} />
                </span>
              ))}
            </div>
            {!balanced && draft.voters !== "" && (
              <p className="alert" role="alert">{es.form.mismatch}</p>
            )}
            {!coherent && (
              <p className="alert" role="alert">{es.form.territory}</p>
            )}
            {coherent && !codeMatches && (
              <p className="alert" role="alert">{es.form.codeMismatch(expectedRecordCode(tableNum))}</p>
            )}
            <label className="field" htmlFor="f-photo">{es.form.photo}</label>
            <input
              id="f-photo"
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setPhoto(f);
                if (f) {
                  void f.arrayBuffer().then((b) => sha256Hex(b).then(setPhotoHash));
                } else {
                  setPhotoHash("");
                }
              }}
            />
            {photoHash !== "" && <p className="hash mono">{es.form.photoHash(photoHash)}</p>}
            {formError && <p className="alert" role="alert">{formError}</p>}
            <button className="btn-primary" type="submit">{es.form.submit}</button>
          </form>
        </section>
        <section className="card" aria-label={es.queue.title(queue.length)}>
          <h2>{es.queue.title(queue.length)}</h2>
          {queue.length === 0 && <p className="meta">{es.queue.empty}</p>}
          {queue.map((item) => {
            const p = pillForStatus(item);
            return (
              <div className="queue-row" key={item.idem}>
                <span className="row-data">
                  <span className="record-id">{item.sheet.code} · v{item.sheet.version}</span>
                  <br />
                  <span className={`pill ${p.tone}`}>{p.text}</span>{" "}
                  <span className="row-detail">{es.queue.attempts(item.attempts)}</span>
                </span>
                <span className="row-action">
                  <button className="btn-secondary" type="button" onClick={() => engine.current?.queryRecord(item.sheet.code)}>{es.queue.query}</button>{" "}
                  <button className="btn-secondary" type="button" onClick={() => startCorrection(item)}>{es.queue.correct}</button>
                </span>
              </div>
            );
          })}
        </section>
      </main>
    </>
  );
}

function SignIn({ onEnter }: { onEnter: (s: Session) => void }): JSX.Element {
  const [user, setUser] = useState("JUR-88134");
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
