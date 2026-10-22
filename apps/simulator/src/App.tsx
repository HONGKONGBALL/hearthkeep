import { useEffect, useRef, useState } from "react";
import { CodeLock, WelcomeOverlay } from "./chrome";
import { HearthkeepClient, type SimSnapshot } from "./mcp-client";
import {
  PROTOCOL_LABEL,
  QUICK_CHIPS,
  emptyDialogue,
  executeTurn,
  formatShortDate,
  formatSimHeader,
  type CardPayload,
  type DialogueState,
  type TraceStep,
} from "./planner";
import { FICTIONAL_CHIP, NEXT_MORNING_LABEL, SIMULATION_RIBBON, TRY_HINT } from "./ui-copy";

const SERVER = "http://127.0.0.1:8787";
const WELCOME_KEY = "hearthkeep.welcome.dismissed";
const CARD_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'";

const DATA_TABS = ["Appliances", "Schedule", "Inventory", "Orders and bookings", "Tasks", "Audit"] as const;
type DataTab = (typeof DATA_TABS)[number];

interface VisibleTurn {
  user?: string;
  assistant: string;
  alert: string | null;
}

interface TraceTransport {
  method: string;
  status: number;
  detail: string;
}

interface TraceRow {
  label: string;
  intent: string;
  slots: Record<string, unknown>;
  guards: string[];
  steps: TraceStep[];
  transport: TraceTransport[];
}

let bootStarted = false;

function hostDocument(html: string): string {
  if (html.includes("Content-Security-Policy")) return html;
  return html.replace("<head>", `<head><meta http-equiv="Content-Security-Policy" content="${CARD_CSP}">`);
}

function cell(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

/** Show calendar dates as "Fri, Oct 23". Other values stay as stored. */
function when(value: unknown): string {
  const text = cell(value);
  const ymd = text.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(ymd) && (text.length === 10 || text[10] === "T")) return formatShortDate(ymd);
  return text;
}

export function App() {
  const clientRef = useRef<HearthkeepClient | null>(null);
  const dialogueRef = useRef<DialogueState>(emptyDialogue());
  const clockRef = useRef("2026-10-21T09:00:00-07:00");
  const htmlCache = useRef(new Map<string, string>());
  const [welcome, setWelcome] = useState(true);
  const [connection, setConnection] = useState<"connecting" | "connected" | "down">("connecting");
  const [sessionPrefix, setSessionPrefix] = useState("");
  const [clockIso, setClockIso] = useState(clockRef.current);
  const [turns, setTurns] = useState<VisibleTurn[]>([]);
  const [traces, setTraces] = useState<TraceRow[]>([]);
  const [showTrace, setShowTrace] = useState(false);
  const [showData, setShowData] = useState(false);
  const [showCards, setShowCards] = useState(true);
  const [voice, setVoice] = useState(false);
  const [about, setAbout] = useState(false);
  const [card, setCard] = useState<CardPayload | null>(null);
  const [cardHtml, setCardHtml] = useState("");
  const [snapshot, setSnapshot] = useState<SimSnapshot | null>(null);
  const [dataTab, setDataTab] = useState<DataTab>("Appliances");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [awaitingCode, setAwaitingCode] = useState(false);
  const [rawOpen, setRawOpen] = useState<Record<string, boolean>>({});

  function client(): HearthkeepClient {
    if (clientRef.current === null) {
      clientRef.current = new HearthkeepClient(SERVER, window.location.origin);
    }
    return clientRef.current;
  }

  function rememberClock(iso: string): void {
    if (iso.trim() === "") return;
    clockRef.current = iso;
    setClockIso(iso);
  }

  async function refreshData(): Promise<void> {
    try {
      setSnapshot(await client().getSimState());
    } catch {
      setSnapshot(null);
    }
  }

  async function showCard(next: CardPayload | null): Promise<void> {
    if (next === null) {
      setCard(null);
      setCardHtml("");
      return;
    }
    let enriched = next;
    try {
      const state = await client().getSimState();
      const applianceNames: Record<string, string> = {};
      for (const appliance of state.appliances) {
        const id = String(appliance.id ?? "");
        if (id !== "") applianceNames[id] = String(appliance.spokenName ?? "");
      }
      enriched = { ...next, context: { ...next.context, applianceNames } };
      setSnapshot(state);
    } catch {
      enriched = next;
    }
    let html = htmlCache.current.get(next.uri);
    if (html === undefined) {
      const read = await client().readResource(next.uri);
      html = read.text;
      htmlCache.current.set(next.uri, html);
    }
    setCard(enriched);
    setCardHtml(html);
  }

  async function runUtterance(utterance: string, showUser: boolean, transport: TraceTransport[] = []): Promise<void> {
    setBusy(true);
    setSpeaking(true);
    try {
      const turn = await executeTurn({
        utterance,
        state: dialogueRef.current,
        clock: { iso: clockRef.current },
        callTool: (name, args) => client().callTool(name, args),
      });
      dialogueRef.current = turn.state;
      setAwaitingCode(turn.state.awaitingCode);
      setTurns((current) => {
        const next = [
          ...current,
          {
            ...(showUser ? { user: turn.displayUtterance } : {}),
            assistant: turn.reply,
            alert: turn.alert,
          },
        ];
        return next.slice(-6);
      });
      setTraces((current) => [
        ...current,
        {
          label: showUser ? turn.displayUtterance : "Session opened",
          intent: turn.intent,
          slots: turn.slots as unknown as Record<string, unknown>,
          guards: turn.guards,
          steps: turn.steps,
          transport,
        },
      ]);
      if (turn.unreachable) setConnection("down");
      else setConnection("connected");
      await showCard(turn.card);
      if (voice && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(turn.reply));
      }
    } catch {
      setConnection("down");
    } finally {
      setBusy(false);
      window.setTimeout(() => setSpeaking(false), 900);
    }
  }

  async function openSession(keepTranscript: boolean): Promise<void> {
    setConnection("connecting");
    setBusy(true);
    try {
      const health = await client().health();
      rememberClock(health.simNow ?? clockRef.current);
      const status = await client().initialize();
      setSessionPrefix(client().sessionPrefix);
      dialogueRef.current = emptyDialogue();
      setAwaitingCode(false);
      if (!keepTranscript) {
        setTurns([]);
        setTraces([]);
        setCard(null);
      }
      setConnection("connected");
      await runUtterance("", false, [{ method: "initialize", status, detail: "session" }]);
      await refreshData();
    } catch {
      setConnection("down");
      setBusy(false);
    }
  }

  useEffect(() => {
    const seen = window.localStorage.getItem(WELCOME_KEY) === "1";
    setWelcome(!seen);
    if (bootStarted) return;
    bootStarted = true;
    if (seen) void openSession(false);
  }, []);

  async function onStart(): Promise<void> {
    window.localStorage.setItem(WELCOME_KEY, "1");
    setWelcome(false);
    await openSession(false);
  }

  async function onSend(utterance: string): Promise<void> {
    const text = utterance.trim();
    if (text === "" || busy) return;
    setDraft("");
    await runUtterance(text, true);
  }

  async function onNewSession(): Promise<void> {
    if (busy) return;
    setBusy(true);
    try {
      const deleted = client().sessionId ? await client().deleteSession() : 0;
      await openSession(false);
      setTraces((current) => [
        { label: "New session", intent: "session", slots: {}, guards: [], steps: [], transport: [{ method: "DELETE", status: deleted, detail: "session" }] },
        ...current,
      ]);
    } catch {
      setConnection("down");
      setBusy(false);
    }
  }

  async function onNextMorning(): Promise<void> {
    if (busy) return;
    setBusy(true);
    try {
      const now = await client().advanceDays(1);
      rememberClock(now);
      const deleted = client().sessionId ? await client().deleteSession() : 0;
      const health = await client().health();
      rememberClock(health.simNow ?? now);
      const status = await client().initialize();
      setSessionPrefix(client().sessionPrefix);
      dialogueRef.current = emptyDialogue();
      setAwaitingCode(false);
      setTurns([]);
      setConnection("connected");
      await runUtterance("", false, [
        { method: "DELETE", status: deleted, detail: "session" },
        { method: "initialize", status, detail: "session" },
      ]);
    } catch {
      setConnection("down");
      setBusy(false);
    }
  }

  async function onReset(): Promise<void> {
    if (busy) return;
    setBusy(true);
    try {
      if (client().sessionId) await client().deleteSession();
      const now = await client().resetSim();
      rememberClock(now);
      await openSession(false);
    } catch {
      setConnection("down");
      setBusy(false);
    }
  }

  async function onRetry(): Promise<void> {
    clientRef.current = new HearthkeepClient(SERVER, window.location.origin);
    await openSession(true);
  }

  const visible = turns.slice(-6);
  const latestAlert = [...visible].reverse().find((turn) => turn.alert)?.alert ?? null;

  const pageClass = showTrace || showData ? "page page-panels" : "page";

  return (
    <div className={pageClass}>
      <header className="top">
        <div className="identity">
          <strong className="brand"><span className="mark" aria-hidden="true" />Hearthkeep</strong>
          <span className="meta">Session {sessionPrefix || "—"}</span>
          <span className="meta">{PROTOCOL_LABEL}</span>
          <span className="meta">{formatSimHeader(clockIso)}</span>
          <span className="badge">Deterministic (offline)</span>
          <span className={`status status-${connection}`}>
            {connection === "down" ? "Server unreachable" : connection === "connecting" ? "Connecting" : "Connected"}
          </span>
        </div>
        <div className="controls">
          <button type="button" onClick={() => void onNewSession()} disabled={busy}>New session</button>
          <button type="button" onClick={() => void onNextMorning()} disabled={busy}>{NEXT_MORNING_LABEL}</button>
          <button type="button" onClick={() => void onReset()} disabled={busy}>Reset demo</button>
          <button type="button" aria-pressed={showTrace} onClick={() => setShowTrace((value) => !value)}>Trace</button>
          <button type="button" aria-pressed={showData} onClick={() => { setShowData((value) => !value); void refreshData(); }}>Data</button>
          <button type="button" aria-pressed={showCards} onClick={() => setShowCards((value) => !value)}>Cards</button>
          <button type="button" aria-pressed={voice} onClick={() => setVoice((value) => !value)}>Voice</button>
          <button type="button" onClick={() => setAbout(true)}>About</button>
        </div>
      </header>

      {connection === "down" ? (
        <p className="banner" role="alert">
          Can't reach the home server
          <button type="button" onClick={() => void onRetry()}>Retry</button>
        </p>
      ) : null}

      <section className="frame" aria-label="Simulated smart display">
        <p className="ribbon">{SIMULATION_RIBBON}</p>
        <div className="frame-bar">
          <span className="chip">{FICTIONAL_CHIP}</span>
          <time className="clock" dateTime={clockIso}>{formatSimHeader(clockIso)}</time>
          <p className="hint">{TRY_HINT}</p>
        </div>
        <div className="frame-body">
          <div className="conversation">
            <h2 className="sr-only">Conversation</h2>
            <div className="transcript" aria-live="polite" tabIndex={0}>
              {connection === "connecting" && visible.length === 0 ? <p>Connecting…</p> : null}
              {visible.map((turn, index) => (
                <article key={`${turn.assistant}-${index}`}>
                  {turn.user ? <p className="user">{turn.user}</p> : null}
                  <p className={index === visible.length - 1 && speaking ? "assistant speaking" : "assistant"}>{turn.assistant}</p>
                </article>
              ))}
            </div>
            {latestAlert ? <p className="alert" role="alert">{latestAlert}</p> : null}
            <div className="chips" role="group" aria-label="Quick replies in demo order">
              {QUICK_CHIPS.map((chip) => (
                <button key={chip.label} type="button" disabled={busy} onClick={() => void onSend(chip.utterance)}>
                  {chip.label}
                </button>
              ))}
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void onSend(draft);
              }}
            >
              <label htmlFor="say">{awaitingCode ? "Purchase code" : "Say something"}</label>
              <div className="composer">
                {awaitingCode ? <CodeLock /> : null}
                <input
                  id="say"
                  value={draft}
                  disabled={busy || connection === "down"}
                  placeholder={awaitingCode ? "Say your purchase code" : "Type what you'd say..."}
                  onChange={(event) => setDraft(event.target.value)}
                />
                <button type="submit" disabled={busy || connection === "down"}>Send</button>
              </div>
            </form>
          </div>
          <div className="stage" aria-label="Card">
            {showCards && card && cardHtml ? (
              <CardHost html={cardHtml} payload={card} onIntent={(utterance) => void onSend(utterance)} />
            ) : (
              <p className="card-placeholder">{showCards ? "Cards appear here." : "Cards are off. Replies stay in the transcript."}</p>
            )}
          </div>
        </div>
      </section>

      {showTrace ? (
        <aside className="panel" aria-label="Trace">
          <h2>Trace</h2>
          {traces.length === 0 ? <p>No turns yet.</p> : null}
          {traces.map((row, index) => (
            <article key={`${row.label}-${index}`} className="trace-turn">
              <h3>{row.label || "Turn"}</h3>
              <p>Intent {row.intent}</p>
              <p>Slots {JSON.stringify(row.slots)}</p>
              {row.guards.length > 0 ? <p>Guards {row.guards.join(", ")}</p> : null}
              <ul>
                {row.transport.map((call) => (
                  <li key={`${call.method}-${call.detail}`}>{call.method} {call.status} {call.detail}</li>
                ))}
                {row.steps.map((step, stepIndex) => {
                  const key = `${index}-${stepIndex}`;
                  return (
                    <li key={key}>
                      <span>{step.method}</span> <span>{step.tool}</span> <span>{step.status}</span>{" "}
                      <span>HTTP {step.httpStatus}</span> <span>{step.ms} ms</span>{" "}
                      <span>{step.sessionPrefix || "—"}</span> <span>{step.protocol}</span>
                      <button type="button" onClick={() => setRawOpen((current) => ({ ...current, [key]: !current[key] }))}>
                        Raw JSON
                      </button>
                      {rawOpen[key] ? (
                        <pre>{JSON.stringify({ request: step.rawRequest, response: step.rawResponse, args: step.args }, null, 2)}</pre>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </article>
          ))}
        </aside>
      ) : null}

      {showData ? (
        <aside className="panel" aria-label="Data">
          <h2>Household data</h2>
          <p className="banner">All data is fictional sample data</p>
          <div className="tabs">
            {DATA_TABS.map((tab) => (
              <button key={tab} type="button" aria-pressed={dataTab === tab} onClick={() => setDataTab(tab)}>{tab}</button>
            ))}
          </div>
          <DataView tab={dataTab} snapshot={snapshot} />
        </aside>
      ) : null}

      {about ? (
        <div className="overlay" role="dialog" aria-labelledby="about-title">
          <div className="sheet">
            <h2 id="about-title">About this simulation</h2>
            <p>Planner: deterministic, offline. Storage: SQLite. Payment: mock. Catalog: fictional seed.</p>
            <p>Endpoint {SERVER}/mcp. Protocol {PROTOCOL_LABEL}.</p>
            <p>SIMULATION — not a real Alexa+ device. All household names, prices, and appointments are fictional.</p>
            <p>MIT license. No network calls leave this computer except the local server.</p>
            <button type="button" onClick={() => setAbout(false)}>Close</button>
          </div>
        </div>
      ) : null}

      {welcome ? <WelcomeOverlay onStart={() => void onStart()} /> : null}
    </div>
  );
}

function CardHost({
  html,
  payload,
  onIntent,
}: {
  html: string;
  payload: CardPayload;
  onIntent: (utterance: string) => void;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const intentRef = useRef(onIntent);
  intentRef.current = onIntent;

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const send = (): void => {
      frame.contentWindow?.postMessage(
        {
          source: "hearthkeep-host",
          type: "tool-result",
          tool: payload.tool,
          structuredContent: payload.structuredContent,
          context: payload.context,
        },
        "*",
      );
    };
    const onMessage = (event: MessageEvent): void => {
      if (event.source !== frame.contentWindow) return;
      const data = event.data as { source?: string; type?: string; utterance?: string } | null;
      if (!data || data.source !== "hearthkeep-card") return;
      if (data.type === "ready") send();
      if (data.type === "intent" && typeof data.utterance === "string") intentRef.current(data.utterance);
    };
    window.addEventListener("message", onMessage);
    frame.addEventListener("load", send);
    send();
    return () => {
      window.removeEventListener("message", onMessage);
      frame.removeEventListener("load", send);
    };
  }, [html, payload]);

  return (
    <iframe
      ref={frameRef}
      className="card-frame"
      title={`${payload.tool} card`}
      sandbox="allow-scripts"
      srcDoc={hostDocument(html)}
    />
  );
}

function DataView({ tab, snapshot }: { tab: DataTab; snapshot: SimSnapshot | null }) {
  if (snapshot === null) return <p>Household data is not loaded.</p>;
  if (tab === "Appliances") {
    return (
      <table>
        <thead><tr><th>Name</th><th>Maker</th><th>Model</th><th>Location</th></tr></thead>
        <tbody>
          {snapshot.appliances.map((row) => (
            <tr key={cell(row.id)}><td>{cell(row.spokenName)}</td><td>{cell(row.maker)}</td><td>{cell(row.model)}</td><td>{cell(row.location)}</td></tr>
          ))}
        </tbody>
      </table>
    );
  }
  if (tab === "Schedule") {
    return (
      <table>
        <thead><tr><th>Appliance</th><th>Item</th><th>Next due</th></tr></thead>
        <tbody>
          {snapshot.schedule.map((row) => (
            <tr key={cell(row.applianceId) + cell(row.item)}><td>{cell(row.applianceId)}</td><td>{cell(row.item)}</td><td>{cell(row.nextDue)}</td></tr>
          ))}
        </tbody>
      </table>
    );
  }
  if (tab === "Inventory") {
    return (
      <table>
        <thead><tr><th>Item</th><th>Name</th><th>Qty</th><th>Location</th></tr></thead>
        <tbody>
          {snapshot.inventory.map((row) => (
            <tr key={cell(row.id)}><td>{cell(row.item)}</td><td>{cell(row.name)}</td><td>{cell(row.qty)}</td><td>{cell(row.location)}</td></tr>
          ))}
        </tbody>
      </table>
    );
  }
  if (tab === "Orders and bookings") {
    return (
      <>
        <table>
          <thead><tr><th>Order</th><th>Status</th><th>Total</th><th>ETA</th></tr></thead>
          <tbody>
            {snapshot.orders.map((row) => (
              <tr key={cell(row.id)}><td>{cell(row.id)}</td><td>{cell(row.status)}</td><td>{cell(row.totalUsd)}</td><td>{when(row.eta)}</td></tr>
            ))}
          </tbody>
        </table>
        <table>
          <thead><tr><th>Booking</th><th>Status</th><th>Provider</th><th>Window</th></tr></thead>
          <tbody>
            {snapshot.bookings.map((row) => (
              <tr key={cell(row.id)}><td>{cell(row.id)}</td><td>{cell(row.status)}</td><td>{cell(row.provider)}</td><td>{when(row.windowStart)}</td></tr>
            ))}
          </tbody>
        </table>
      </>
    );
  }
  if (tab === "Tasks") {
    return (
      <table>
        <thead><tr><th>Task</th><th>Title</th><th>Due</th><th>Status</th></tr></thead>
        <tbody>
          {snapshot.tasks.map((row) => (
            <tr key={cell(row.id)}><td>{cell(row.id)}</td><td>{cell(row.title)}</td><td>{when(row.dueDate)}</td><td>{cell(row.status)}</td></tr>
          ))}
        </tbody>
      </table>
    );
  }
  return (
    <table>
      <thead><tr><th>When</th><th>Action</th><th>Entity</th></tr></thead>
      <tbody>
        {snapshot.audit.map((row) => (
          <tr key={cell(row.id)}><td>{cell(row.at)}</td><td>{cell(row.action)}</td><td>{cell(row.entityId)}</td></tr>
        ))}
      </tbody>
    </table>
  );
}
