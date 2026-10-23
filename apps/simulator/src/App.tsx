import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CodeLock, Icon, Ribbon, WelcomeOverlay } from "./chrome";
import { HearthkeepClient, type OpenedSession, type SimSnapshot } from "./mcp-client";
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
import { acceptUtterance, isCardFrameSource, nextIntent, rememberCardWindow } from "./turn-queue";
import { ABOUT_LICENSE, FICTIONAL_CHIP, NEXT_MORNING_LABEL, TRY_HINT } from "./ui-copy";

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

/** initialize 200, then notifications/initialized 202. Leading rows cover DELETE on a replaced session. */
function sessionTransport(opened: OpenedSession, leading: TraceTransport[] = []): TraceTransport[] {
  return [
    ...leading,
    { method: "initialize", status: opened.status, detail: "session" },
    { method: "notifications/initialized", status: opened.initialized, detail: "session" },
  ];
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

/** Status-card skin. The server document stays the source of the rows and buttons. */
const STATUS_SKIN = `<style>
body:has(main[data-card="status"]){background:transparent;color:#14301F;font-family:Figtree,Nunito,"Segoe UI",sans-serif}
body:has(main[data-card="status"]) .chip{display:inline-flex;align-items:center;margin:0;padding:4px 12px;border-radius:999px;background:#D5F3DF;color:#0B7039;font-size:13px;font-weight:600;letter-spacing:0}
main[data-card="status"]{padding:4px 8px 8px}
main[data-card="status"] h2{display:flex;align-items:center;gap:8px;margin:10px 0 4px;font:600 12px/1 Figtree,Nunito,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#4F6353}
main[data-card="status"] h2 .n{min-width:22px;height:22px;padding:0 6px;border-radius:999px;display:inline-grid;place-items:center;background:#EAF1DE;color:#14301F;font:700 12px/1 Figtree,Nunito,sans-serif;letter-spacing:0;text-transform:none}
main[data-card="status"] ul{display:flex;flex-direction:column}
main[data-card="status"] li{margin:0 0 12px;color:#14301F;font-size:20px;line-height:1.3}
main[data-card="status"] li.row{display:grid;grid-template-columns:52px minmax(0,1fr) auto;column-gap:8px;align-items:center;padding:4px 0;background:transparent;border:0;border-radius:0}
main[data-card="status"] li:not(.row){display:grid;grid-template-columns:52px minmax(0,1fr);column-gap:8px;align-items:center}
main[data-card="status"] .row span{min-width:0;font-weight:600}
main[data-card="status"] button{background:#FFFEF8;color:#14301F;border:1.5px solid #14301F;border-radius:999px;min-height:44px;padding:6px 14px;font-weight:600}
main[data-card="status"] .hk-ring{position:relative;width:52px;height:52px;display:grid;place-items:center}
main[data-card="status"] .hk-ring .arc{position:absolute;inset:0;transform:rotate(-90deg)}
main[data-card="status"] .hk-ring circle{fill:none;stroke-width:6;stroke-linecap:round}
main[data-card="status"] .hk-ring .trk{stroke:#EAF1DE}
main[data-card="status"] .hk-ring.leaf .fil{stroke:#1FA85B}
main[data-card="status"] .hk-ring.lemon .fil{stroke:#F2B705}
main[data-card="status"] .hk-ring.berry .fil{stroke:#EE4258}
main[data-card="status"] .hk-ring .ovr{stroke:#A3122A}
main[data-card="status"] .hk-ring .ico{width:20px;height:20px;fill:none;stroke:#14301F;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round}
main[data-card="status"] .hk-ring .fil,main[data-card="status"] .hk-ring .ovr{animation:hkdraw 700ms cubic-bezier(.2,.8,.2,1) both}
@keyframes hkdraw{from{stroke-dasharray:0 200}}
@media (prefers-reduced-motion:reduce){main[data-card="status"] .hk-ring .fil,main[data-card="status"] .hk-ring .ovr{animation:none!important}}
</style>
<script>
(function(){
var PATHS={vent_cleaning:"M3 8.5h10.5a2.75 2.75 0 1 0-2.75-2.75M3 12.5h15a3 3 0 1 1-3 3M3 16.5h7",water_filter:"M12 3.5s-6 6.4-6 10.6a6 6 0 0 0 12 0C18 9.9 12 3.5 12 3.5z",air_filter:"M4 4h16v16H4zM4 9.4h16M4 14.6h16M9.4 4v16M14.6 4v16",battery:"M3 8h16v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM21 11v3M7 11v4M11 11v4",bulb:"M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z"};
function ringHtml(vital){
  var ratio=Number(vital.ratio);
  if(!isFinite(ratio)||ratio<0)ratio=0;
  var tone=vital.tone==="berry"||vital.tone==="lemon"||vital.tone==="leaf"?vital.tone:(ratio>1.004?"berry":(ratio>=0.996?"lemon":"leaf"));
  var pct=Math.round(ratio*100);
  var C=2*Math.PI*22;
  var full=Math.min(ratio,1)*C;
  var over=Math.max(0,ratio-1)*C;
  var ovr=over>0.4?'<circle class="ovr" cx="26" cy="26" r="22" stroke-dasharray="'+over.toFixed(1)+' '+C.toFixed(1)+'"></circle>':'';
  var path=PATHS[vital.item]||"";
  var icon=path?'<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="'+path+'"></path></svg>':'';
  return '<i class="hk-ring '+tone+'" role="img" aria-label="'+pct+'% of interval used"><svg class="arc" viewBox="0 0 52 52" width="52" height="52" aria-hidden="true"><circle class="trk" cx="26" cy="26" r="22"></circle><circle class="fil" cx="26" cy="26" r="22" stroke-dasharray="'+full.toFixed(1)+' '+C.toFixed(1)+'"></circle>'+ovr+'</svg>'+icon+'</i>';
}
function paint(vitals){
  var main=document.querySelector('main[data-card="status"]');
  if(!main)return;
  main.querySelectorAll(".hk-ring").forEach(function(node){node.remove();});
  main.querySelectorAll("h2 .n").forEach(function(node){node.remove();});
  var list=vitals||[];
  main.querySelectorAll("li").forEach(function(li){
    var text=li.textContent||"";
    var vital=null;
    for(var i=0;i<list.length;i++){
      if(list[i]&&list[i].label&&text.indexOf(list[i].label)!==-1){vital=list[i];break;}
    }
    if(!vital)return;
    li.insertAdjacentHTML("afterbegin",ringHtml(vital));
  });
  main.querySelectorAll("section").forEach(function(section){
    var h2=section.querySelector("h2");
    if(!h2)return;
    var count=section.querySelectorAll("li").length;
    if(!count)return;
    var badge=document.createElement("span");
    badge.className="n";
    badge.textContent=String(count);
    h2.appendChild(badge);
  });
}
window.addEventListener("message",function(event){
  var data=event.data;
  if(!data||data.source!=="hearthkeep-host"||data.type!=="tool-result")return;
  var vitals=(data.context&&data.context.vitals)||[];
  var content=data.structuredContent||{};
  setTimeout(function(){paint(vitals);if(window.dressOptions)window.dressOptions(content);},0);
});
})();
</script>`;

/** Options-card skin. The server document stays the source of the tiles, badges, and footer. */
const OPTIONS_SKIN = `<style>
body:has(main[data-card="options"]){background:transparent;color:#14301F;font-family:Figtree,Nunito,"Segoe UI",sans-serif}
body:has(main[data-card="options"]) .chip{display:inline-flex;align-items:center;margin:0 0 4px 8px;padding:4px 12px;border-radius:999px;background:#D5F3DF;color:#0B7039;font-size:13px;font-weight:600;letter-spacing:0}
main[data-card="options"]{padding:4px 8px 8px}
main[data-card="options"] .tiles{display:flex;flex-flow:row nowrap;align-items:stretch;gap:16px;margin-top:22px}
main[data-card="options"] .tile{position:relative;flex:1 1 0;min-width:0;display:flex;flex-direction:column;align-items:stretch;gap:5px;text-align:left;background:#FFFEF8;color:#14301F;border:1.5px solid #D9E2CC;border-radius:20px;padding:24px 16px 14px;white-space:normal;overflow-wrap:break-word;overflow:visible}
main[data-card="options"] .tile.rec{background:linear-gradient(180deg,#E7F8EC 0,#FFFEF8 70%);border-color:#1FA85B}
main[data-card="options"] .tile strong{display:block;margin:0;padding:0;font:700 24px/1.15 Figtree,Nunito,"Segoe UI",sans-serif;letter-spacing:-.015em}
main[data-card="options"] .fits{font-size:20px;line-height:1.25;color:#4F6353;font-weight:400}
main[data-card="options"] .price{font:700 40px/1 Figtree,Nunito,"Segoe UI",sans-serif;letter-spacing:-.025em;margin-top:2px;color:#14301F}
main[data-card="options"].wide .price{font-size:32px}
main[data-card="options"] .eta{font-size:20px;line-height:1.25;font-weight:500;color:#14301F}
main[data-card="options"] .badges{display:flex;flex-wrap:wrap;gap:6px;margin:2px 0 0;min-width:0;width:100%}
main[data-card="options"] .badge{max-width:100%;min-height:28px;display:inline-flex;align-items:center;padding:2px 11px;border-radius:999px;background:#EAF1DE;color:#14301F;font-size:15px;font-weight:600;line-height:1.2;letter-spacing:0}
main[data-card="options"] .badge.cert{background:#D5F3DF;color:#0B7039}
main[data-card="options"] .badge.limit{background:#FFE2E4;color:#B3172F}
main[data-card="options"] .sticker{position:absolute;top:-17px;right:16px;z-index:2;height:30px;max-width:calc(100% - 32px);display:inline-flex;align-items:center;padding:0 13px;border-radius:999px;background:#FF6A2B;color:#14301F;font:700 15px/1 Figtree,Nunito,"Segoe UI",sans-serif;letter-spacing:0;white-space:nowrap;transform:rotate(-4deg);box-shadow:0 6px 14px -6px rgba(255,106,43,.8);animation:hkpop 420ms cubic-bezier(.34,1.4,.64,1) both}
main[data-card="options"] .why{font-size:20px;line-height:1.25;font-weight:600;color:#0B7039}
main[data-card="options"] .why.quiet{color:#4F6353;font-weight:500}
main[data-card="options"] .act{margin-top:auto;height:44px;border-radius:999px;display:flex;align-items:center;justify-content:center;border:1.5px solid #14301F;background:#FFFEF8;color:#14301F;font-size:20px;font-weight:700;letter-spacing:0;padding:0 12px}
main[data-card="options"] .tile.rec .act{background:#FF6A2B;border-color:#FF6A2B;color:#14301F}
main[data-card="options"] .tile:focus-visible{outline:none;box-shadow:0 0 0 3px #FFFEF8,0 0 0 5px #0B7039}
main[data-card="options"] .foot{margin:12px 0 0;padding:10px 16px;background:#EAF1DE;border:0;border-radius:20px;font-size:20px;line-height:1.3;color:#14301F}
main[data-card="options"] .foot:has(+ .stock){border-radius:20px 20px 0 0;padding-bottom:2px}
main[data-card="options"] .stock{margin:0;padding:2px 16px 10px;background:#EAF1DE;border-radius:0 0 20px 20px;font-size:20px;line-height:1.3;color:#4F6353}
@keyframes hkpop{from{transform:rotate(-4deg) scale(.6)}to{transform:rotate(-4deg) scale(1)}}
@media (prefers-reduced-motion:reduce){main[data-card="options"] .sticker{animation:none!important}}
</style>
<script>
(function(){
function cents(value){var n=Number(value);return isFinite(n)?Math.round(n*100):0;}
function reasonFor(option,list){
  if(!option)return "";
  if(option.recommended!==true)return option.kind==="oem"?"Maker's own part":"";
  var price=cents(option.priceUsd);
  for(var i=0;i<list.length;i++){if(cents(list[i]&&list[i].priceUsd)<price)return "Earliest arrival your rules allow";}
  return "Cheapest option your rules allow";
}
function stockLine(data){
  var options=data.options||[];
  if(!options.length)return "";
  var onHand=data.onHand;
  if(!onHand||typeof onHand.qty!=="number")return "";
  if(onHand.qty<=0)return "Stock checked first: 0 on hand";
  var where=typeof onHand.location==="string"&&onHand.location?" · "+onHand.location:"";
  return "Stock checked first: "+onHand.qty+" on hand"+where;
}
window.dressOptions=function(data){
  var main=document.querySelector('main[data-card="options"]');
  if(!main)return;
  var options=(data&&data.options)||[];
  var tiles=[].slice.call(main.querySelectorAll("[data-tile]"));
  main.classList.toggle("wide",tiles.length>=3);
  tiles.forEach(function(tile,index){
    var option=options[index]||null;
    if(!tile.querySelector(".sticker")){
      var badges=tile.querySelectorAll(".badge");
      for(var i=0;i<badges.length;i++){
        if((badges[i].textContent||"")!=="Recommended")continue;
        badges[i].classList.remove("badge");
        badges[i].classList.add("sticker");
        tile.insertBefore(badges[i],tile.firstChild);
        break;
      }
    }
    if(tile.querySelector(".sticker"))tile.classList.add("rec");
    var plain=[];
    [].slice.call(tile.children).forEach(function(node){
      if(node.tagName!=="SPAN")return;
      if(node.classList.contains("badges")||node.classList.contains("act")||node.classList.contains("why")||node.classList.contains("sticker"))return;
      plain.push(node);
    });
    if(plain[0])plain[0].classList.add("fits");
    if(plain[1])plain[1].classList.add("price");
    if(plain[2])plain[2].classList.add("eta");
    tile.querySelectorAll(".badge").forEach(function(node){
      if((node.textContent||"")==="Certified")node.classList.add("cert");
    });
    if(!tile.querySelector(".why")){
      var why=reasonFor(option,options);
      if(why){
        var line=document.createElement("span");
        line.className="why"+(option&&option.recommended===true?"":" quiet");
        line.textContent=why;
        var act=tile.querySelector(".act");
        if(act)tile.insertBefore(line,act);else tile.appendChild(line);
      }
    }
  });
  var text=stockLine(data||{});
  var stock=main.querySelector(".stock");
  if(!text){if(stock)stock.remove();return;}
  if(!stock){stock=document.createElement("p");stock.className="stock";main.appendChild(stock);}
  stock.textContent=text;
};
})();
</script>`;

function hostDocument(html: string): string {
  const withPolicy = html.includes("Content-Security-Policy")
    ? html
    : html.replace("<head>", `<head><meta http-equiv="Content-Security-Policy" content="${CARD_CSP}">`);
  if (withPolicy.includes("hk-ring")) return withPolicy;
  return withPolicy.replace("</body>", `${STATUS_SKIN}${OPTIONS_SKIN}</body>`);
}

function cell(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

const WEEKDAY_LONG: Record<string, string> = {
  Sun: "Sunday",
  Mon: "Monday",
  Tue: "Tuesday",
  Wed: "Wednesday",
  Thu: "Thursday",
  Fri: "Friday",
  Sat: "Saturday",
};

function hour24Of(hour12: number, ap: string): number {
  if (ap === "AM") return hour12 === 12 ? 0 : hour12;
  return hour12 === 12 ? 12 : hour12 + 12;
}

/** Device clock face plus the sun position on the 6 AM–6 PM arc. */
function clockFace(iso: string): {
  header: string;
  time: string;
  ap: string;
  weekday: string;
  monthDay: string;
  sun: { x: number; y: number };
} {
  const header = formatSimHeader(iso);
  const match = header.match(/^([A-Za-z]+), ([A-Za-z]+ \d+), \d+ · (\d+):(\d+) (AM|PM)$/);
  let hour24 = 9;
  let minute = 0;
  let time = "9:00";
  let ap = "AM";
  let weekday = "Wednesday";
  let monthDay = "Oct 21";
  if (match) {
    weekday = WEEKDAY_LONG[match[1]] ?? match[1];
    monthDay = match[2];
    const hour12 = Number(match[3]);
    minute = Number(match[4]);
    ap = match[5] ?? "AM";
    time = `${hour12}:${String(minute).padStart(2, "0")}`;
    hour24 = hour24Of(hour12, ap);
  }
  const t = Math.min(1, Math.max(0, (hour24 * 60 + minute - 6 * 60) / (12 * 60)));
  const angle = Math.PI * (1 - t);
  return {
    header,
    time,
    ap,
    weekday,
    monthDay,
    sun: { x: 32 + 26 * Math.cos(angle), y: 31 - 26 * Math.sin(angle) },
  };
}

function DaylightArc({ x, y }: { x: number; y: number }) {
  const cx = x.toFixed(1);
  const cy = y.toFixed(1);
  return (
    <svg className="arc" viewBox="0 0 64 34" aria-hidden="true">
      <path d="M2 31h60" stroke="#D9E2CC" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M6 31A26 26 0 0 1 58 31" fill="none" stroke="#C9D3BD" strokeWidth="2" strokeDasharray="2 4" strokeLinecap="round" />
      <path d={`M6 31A26 26 0 0 1 ${cx} ${cy}`} fill="none" stroke="#F2B705" strokeWidth="3" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="5.5" fill="#FFD43D" stroke="#FFFEF8" strokeWidth="2" />
    </svg>
  );
}

/** Show calendar dates as "Fri, Oct 23". Other values stay as stored. */
function when(value: unknown): string {
  const text = cell(value);
  const ymd = text.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(ymd) && (text.length === 10 || text[10] === "T")) return formatShortDate(ymd);
  return text;
}

function ymd(value: unknown): string {
  const text = cell(value);
  const date = text.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
}

function daysBetween(fromDate: string, toDate: string): number {
  const [fy, fm, fd] = fromDate.split("-").map(Number);
  const [ty, tm, td] = toDate.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

function humanItem(item: string): string {
  if (item === "air_filter") return "filter";
  return item.replaceAll("_", " ");
}

function sentence(value: string): string {
  const text = value.trim();
  if (text === "") return "";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

interface Vital {
  label: string;
  ratio: number;
  tone: "leaf" | "lemon" | "berry";
  item: string;
}

/** Ring fill is days since last done divided by the interval. */
function vitalsFrom(snapshot: SimSnapshot): Vital[] {
  const today = ymd(snapshot.clock);
  if (today === "") return [];
  const names = new Map(snapshot.appliances.map((row) => [String(row.id ?? ""), String(row.spokenName ?? "")]));
  const vitals: Vital[] = [];
  for (const row of snapshot.schedule) {
    const every = Number(row.everyDays);
    const last = ymd(row.lastDone);
    if (!Number.isFinite(every) || every <= 0 || last === "") continue;
    const spoken = names.get(String(row.applianceId ?? "")) ?? "";
    const item = String(row.item ?? "");
    const label = sentence(spoken && item ? `${spoken} ${humanItem(item)}` : spoken || humanItem(item));
    if (label === "") continue;
    const ratio = Math.max(0, daysBetween(last, today) / every);
    const tone = ratio > 1.004 ? "berry" : ratio >= 0.996 ? "lemon" : "leaf";
    vitals.push({ label, ratio, tone, item });
  }
  return vitals;
}

function chipClass(index: number, history: VisibleTurn[]): string | undefined {
  const used = new Set<number>();
  for (const turn of history) {
    if (!turn.user) continue;
    const match = QUICK_CHIPS.findIndex((chip) => chip.utterance === turn.user || chip.label === turn.user);
    if (match >= 0) used.add(match);
  }
  if (history.some((turn) => !turn.user && turn.assistant.trim() !== "")) used.add(0);
  if (used.has(index)) return "used";
  const next = QUICK_CHIPS.findIndex((_, chipIndex) => !used.has(chipIndex));
  return next === index ? "next" : undefined;
}

function scheduleTone(nextDue: string, today: string): { label: string; tone: string } {
  if (nextDue === "" || today === "") return { label: "—", tone: "none" };
  const delta = daysBetween(today, nextDue);
  if (delta < 0) return { label: `${-delta} d overdue`, tone: "over" };
  if (delta === 0) return { label: "Due today", tone: "today" };
  if (delta <= 14) return { label: `In ${delta} d`, tone: "soon" };
  return { label: "Later", tone: "ok" };
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
  const voiceRef = useRef(voice);
  voiceRef.current = voice;
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
  const shellRef = useRef<HTMLDivElement>(null);
  const busyRef = useRef(false);
  const pendingRef = useRef<string | null>(null);
  const speakTimerRef = useRef<number | null>(null);

  function holdBusy(): void {
    busyRef.current = true;
    setBusy(true);
  }

  function pulseSpeaking(): void {
    setSpeaking(true);
    if (speakTimerRef.current !== null) window.clearTimeout(speakTimerRef.current);
    speakTimerRef.current = window.setTimeout(() => {
      speakTimerRef.current = null;
      setSpeaking(false);
    }, 900);
  }

  /** Run a card tap that landed during this turn, then clear busy. One turn at a time. */
  async function finishBusy(): Promise<void> {
    const queued = nextIntent(pendingRef.current);
    pendingRef.current = null;
    if (queued !== null) {
      await runUtterance(queued, true);
      return;
    }
    busyRef.current = false;
    setBusy(false);
  }

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
      enriched = { ...next, context: { ...next.context, applianceNames, vitals: vitalsFrom(state) } };
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
    holdBusy();
    pulseSpeaking();
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
      if (voiceRef.current && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(turn.reply));
      }
    } catch {
      setConnection("down");
    } finally {
      await finishBusy();
    }
  }

  async function openSession(keepTranscript: boolean): Promise<void> {
    setConnection("connecting");
    holdBusy();
    try {
      const health = await client().health();
      rememberClock(health.simNow ?? clockRef.current);
      const opened = await client().initialize();
      setSessionPrefix(client().sessionPrefix);
      dialogueRef.current = emptyDialogue();
      setAwaitingCode(false);
      if (!keepTranscript) {
        setTurns([]);
        setTraces([]);
        setCard(null);
      }
      setConnection("connected");
      await runUtterance("", false, sessionTransport(opened));
      await refreshData();
    } catch {
      setConnection("down");
      await finishBusy();
    }
  }

  useLayoutEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    // The welcome dialog is a sibling. inert keeps Tab off Next morning, which would advance the sim clock.
    if (welcome) shell.setAttribute("inert", "");
    else shell.removeAttribute("inert");
  }, [welcome]);

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
    const decision = acceptUtterance(busyRef.current, pendingRef.current, utterance);
    pendingRef.current = decision.pending;
    if (utterance.trim() === "") return;
    setDraft("");
    if (decision.start === null) return;
    await runUtterance(decision.start, true);
  }

  async function onNewSession(): Promise<void> {
    if (busyRef.current) return;
    holdBusy();
    try {
      const deleted = client().sessionId ? await client().deleteSession() : 0;
      await openSession(false);
      setTraces((current) => [
        { label: "New session", intent: "session", slots: {}, guards: [], steps: [], transport: [{ method: "DELETE", status: deleted, detail: "session" }] },
        ...current,
      ]);
    } catch {
      setConnection("down");
      await finishBusy();
    }
  }

  async function onNextMorning(): Promise<void> {
    if (busyRef.current) return;
    holdBusy();
    try {
      const now = await client().advanceDays(1);
      rememberClock(now);
      const deleted = client().sessionId ? await client().deleteSession() : 0;
      const health = await client().health();
      rememberClock(health.simNow ?? now);
      const opened = await client().initialize();
      setSessionPrefix(client().sessionPrefix);
      dialogueRef.current = emptyDialogue();
      setAwaitingCode(false);
      setTurns([]);
      setConnection("connected");
      await runUtterance("", false, sessionTransport(opened, [{ method: "DELETE", status: deleted, detail: "session" }]));
    } catch {
      setConnection("down");
      await finishBusy();
    }
  }

  async function onReset(): Promise<void> {
    if (busyRef.current) return;
    holdBusy();
    try {
      if (client().sessionId) await client().deleteSession();
      const now = await client().resetSim();
      rememberClock(now);
      await openSession(false);
    } catch {
      setConnection("down");
      await finishBusy();
    }
  }

  async function onRetry(): Promise<void> {
    clientRef.current = new HearthkeepClient(SERVER, window.location.origin);
    await openSession(true);
  }

  const visible = turns.slice(-6);
  const latestAlert = [...visible].reverse().find((turn) => turn.alert)?.alert ?? null;

  const pageClass = showTrace || showData ? "page page-panels" : "page";
  const face = clockFace(clockIso);
  const connectionLabel = connection === "down" ? "Server unreachable" : connection === "connecting" ? "Connecting" : "Connected";

  return (
    <div className={pageClass}>
      <div className="app-shell" ref={shellRef}>
      <header className="top">
        <div className="hdr-1">
          <div className="identity">
            <strong className="brand"><span className="mark" aria-hidden="true"><Icon name="logo" /></span>Hearthkeep</strong>
            <span className="brand-sub">Simulation host</span>
            <span className={`status status-${connection}`}>
              <span className="dot" aria-hidden="true" />
              {connectionLabel}
              <span className="sep" aria-hidden="true">·</span>
              <span className="meta">Session {sessionPrefix || "—"}</span>
            </span>
            <span className="pill"><span className="k">MCP</span> <span className="mono">{PROTOCOL_LABEL}</span></span>
            <span className="badge">Deterministic (offline)</span>
          </div>
          <div className="simclock">
            <div>
              <span className="lbl">Sim clock</span>
              <b>{face.header}</b>
            </div>
            <span className="sun" aria-hidden="true"><Icon name="sun" /></span>
          </div>
        </div>
        <div className="controls">
          <span className="glabel">Session</span>
          <button type="button" onClick={() => void onNewSession()} disabled={busy}><Icon name="plus" />New session</button>
          <button type="button" onClick={() => void onNextMorning()} disabled={busy}><Icon name="sunrise" />{NEXT_MORNING_LABEL}</button>
          <button type="button" onClick={() => void onReset()} disabled={busy}><Icon name="reset" />Reset demo</button>
          <span className="spacer" />
          <span className="glabel">View</span>
          <button type="button" aria-pressed={showTrace} onClick={() => setShowTrace((value) => !value)}><span className="sw" aria-hidden="true" />Trace</button>
          <button type="button" aria-pressed={showData} onClick={() => { setShowData((value) => !value); void refreshData(); }}><span className="sw" aria-hidden="true" />Data</button>
          <button type="button" aria-pressed={showCards} onClick={() => setShowCards((value) => !value)}><span className="sw" aria-hidden="true" />Cards</button>
          <button type="button" aria-pressed={voice} onClick={() => setVoice((value) => !value)}><span className="sw" aria-hidden="true" />Voice</button>
          <span className="vsep" aria-hidden="true" />
          <button className="lnk" type="button" onClick={() => setAbout(true)}><Icon name="info" />About</button>
        </div>
      </header>

      {connection === "down" ? (
        <p className="banner" role="alert">
          Can't reach the home server
          <button type="button" onClick={() => void onRetry()}>Retry</button>
        </p>
      ) : null}

      <div className="main">
      <div className="col">
      <section className="frame" aria-label="Simulated smart display">
        <div className="screen">
        <div className="frame-bar">
          <Ribbon />
          <p className="fchip"><Icon name="doc" />{FICTIONAL_CHIP}</p>
          <div className="clockblock">
            <DaylightArc x={face.sun.x} y={face.sun.y} />
            <time className="clock" dateTime={clockIso}>
              <span className="t">{face.time}<span>{face.ap}</span></span>
              <span className="d"><b>{face.weekday}</b>{face.monthDay}</span>
            </time>
          </div>
        </div>
        <div className="frame-body">
          <div className="conversation">
            <h2 className="sr-only">Conversation</h2>
            <div className="transcript" aria-live="polite" tabIndex={0}>
              {!welcome && connection === "connecting" && visible.length === 0 ? <p>Connecting…</p> : null}
              {visible.length === 0 && (welcome || connection !== "connecting") ? (
                <div className="idle">
                  <span className="eyebrow">Try</span>
                  <p>{TRY_HINT}</p>
                </div>
              ) : null}
              {visible.some((turn) => !turn.user) ? (
                <p className="sys">Session {sessionPrefix || "—"} opened · briefing from memory</p>
              ) : null}
              {visible.map((turn, index) => {
                const latest = index === visible.length - 1;
                return (
                  <article key={`${turn.assistant}-${index}`}>
                    {turn.user ? (
                      <p className={turn.user === "••••" ? "user code" : "user"}>
                        {turn.user === "••••" ? <Icon name="lock" /> : null}
                        {turn.user}
                      </p>
                    ) : null}
                    {latest ? (
                      <div className="who">
                        {speaking ? (
                          <span className="pulse" aria-hidden="true">
                            <i />
                            <i />
                            <i />
                            <i />
                          </span>
                        ) : null}
                        <span className="eyebrow">Hearthkeep · speaking</span>
                      </div>
                    ) : null}
                    <p className={latest && speaking ? "assistant speaking" : "assistant"}>{turn.assistant}</p>
                  </article>
                );
              })}
            </div>
            {latestAlert ? <p className="alert" role="alert">{latestAlert}</p> : null}
          </div>
          <div className="dock">
            <div className="chips" role="group" aria-label="Quick replies in demo order">
              <span className="eyebrow">Try</span>
              <div className="chiprow">
                {QUICK_CHIPS.map((chip, index) => {
                  const state = chipClass(index, turns);
                  return (
                    <button
                      key={chip.label}
                      type="button"
                      className={state}
                      disabled={busy}
                      onClick={() => void onSend(chip.utterance)}
                    >
                      {state === "used" ? <Icon name="check" /> : null}
                      {chip.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void onSend(draft);
              }}
            >
              <label className="sr-only" htmlFor="say">{awaitingCode ? "Purchase code" : "Say something"}</label>
              <div className={awaitingCode ? "composer is-locked" : "composer"}>
                {awaitingCode ? <CodeLock /> : null}
                <input
                  id="say"
                  value={draft}
                  disabled={busy || connection === "down"}
                  placeholder={awaitingCode ? "Waiting for your purchase code" : "Type what you'd say..."}
                  onChange={(event) => setDraft(event.target.value)}
                />
                {draft === "" ? (
                  <span className="hint">
                    {awaitingCode ? (
                      "digits show as ••••"
                    ) : (
                      <>
                        <kbd>Enter</kbd> sends · a leading “Alexa,” is ignored
                      </>
                    )}
                  </span>
                ) : null}
                <button type="submit" disabled={busy || connection === "down"}>
                  Send
                  <Icon name="arrow" />
                </button>
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
        </div>
      </section>
      </div>

      {showTrace || showData ? <div className="side">
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
        <aside className="panel data-panel" aria-label="Data">
          <div className="panel-h">
            <h2>Data</h2>
            <span className="panel-meta">GET /sim/state · read-only</span>
          </div>
          <div className="tabs">
            {DATA_TABS.map((tab) => (
              <button key={tab} type="button" aria-pressed={dataTab === tab} onClick={() => setDataTab(tab)}>{tab}</button>
            ))}
          </div>
          <p className="data-banner"><Icon name="doc" />All data is fictional sample data</p>
          <div className="plist">
            <DataView tab={dataTab} snapshot={snapshot} />
          </div>
        </aside>
      ) : null}
      </div> : null}
      </div>
      </div>

      {about ? (
        <div className="overlay about-sheet" role="dialog" aria-labelledby="about-title">
          <div className="sheet">
            <h2 id="about-title">About this simulation</h2>
            <p>Planner: deterministic, offline. Storage: SQLite. Payment: mock. Catalog: fictional seed.</p>
            <p>Endpoint {SERVER}/mcp. Protocol {PROTOCOL_LABEL}.</p>
            <p>SIMULATION — not a real Alexa+ device. All household names, prices, and appointments are fictional.</p>
            <p id="about-license">{ABOUT_LICENSE}</p>
            <p>No network calls leave this computer except the local server.</p>
            <button type="button" onClick={() => setAbout(false)}>Close</button>
          </div>
        </div>
      ) : null}

      {welcome ? (
        <WelcomeOverlay
          onStart={() => void onStart()}
          onAbout={() => setAbout(true)}
          clockLabel={face.header}
          serverDetail={`Endpoint ${SERVER}/mcp. Protocol ${PROTOCOL_LABEL}.`}
        />
      ) : null}
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
  const payloadRef = useRef(payload);
  payloadRef.current = payload;
  const liveWindowRef = useRef<Window | null>(null);
  const previousWindowRef = useRef<Window | null>(null);

  function rememberFrame(frame: HTMLIFrameElement): void {
    const noted = rememberCardWindow(liveWindowRef.current, previousWindowRef.current, frame.contentWindow);
    liveWindowRef.current = noted.live;
    previousWindowRef.current = noted.previous;
  }

  function postResult(frame: HTMLIFrameElement): void {
    rememberFrame(frame);
    const current = payloadRef.current;
    frame.contentWindow?.postMessage(
      {
        source: "hearthkeep-host",
        type: "tool-result",
        tool: current.tool,
        structuredContent: current.structuredContent,
        context: current.context,
      },
      "*",
    );
  }

  useEffect(() => {
    // Listener stays up across srcdoc reloads. The load effect below rebinds separately.
    const onMessage = (event: MessageEvent): void => {
      const frame = frameRef.current;
      if (!frame) return;
      rememberFrame(frame);
      const live = frame.contentWindow ?? liveWindowRef.current;
      if (!isCardFrameSource(event.source, live, previousWindowRef.current)) return;
      const data = event.data as { source?: string; type?: string; utterance?: string } | null;
      if (!data || data.source !== "hearthkeep-card") return;
      if (data.type === "ready") postResult(frame);
      if (data.type === "intent" && typeof data.utterance === "string") intentRef.current(data.utterance);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const send = (): void => postResult(frame);
    frame.addEventListener("load", send);
    rememberFrame(frame);
    send();
    return () => frame.removeEventListener("load", send);
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
    const today = ymd(snapshot.clock);
    const names = new Map(snapshot.appliances.map((row) => [String(row.id ?? ""), String(row.spokenName ?? "")]));
    const rows = [...snapshot.schedule].sort((a, b) => {
      const rank = (row: Record<string, unknown>): number => {
        const due = ymd(row.nextDue);
        if (due === "" || today === "") return 4;
        const delta = daysBetween(today, due);
        if (delta < 0) return 0;
        if (delta === 0) return 1;
        if (delta <= 14) return 2;
        return 3;
      };
      return rank(a) - rank(b) || ymd(a.nextDue).localeCompare(ymd(b.nextDue)) || cell(a.applianceId).localeCompare(cell(b.applianceId));
    });
    return (
      <>
        <p className="psec">Schedule · {snapshot.appliances.length} appliances</p>
        <table className="schedule-table">
          <thead><tr><th>Appliance</th><th>Item</th><th>Next due</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map((row) => {
              const due = ymd(row.nextDue);
              const status = scheduleTone(due, today);
              const spoken = names.get(String(row.applianceId ?? "")) ?? cell(row.applianceId);
              const item = cell(row.item);
              const every = typeof row.everyDays === "number" && row.everyDays > 0 ? `every ${row.everyDays} d` : cell(row.trigger);
              const spec = typeof row.spec === "string" && row.spec !== "" ? row.spec : cell(row.how);
              return (
                <tr key={cell(row.applianceId) + item}>
                  <td>
                    <span className="dtitle">{sentence(spoken)} · {humanItem(item)}</span>
                    <span className="dsub">{spec} · {every}</span>
                    <span className="mono">{cell(row.applianceId)}</span>
                  </td>
                  <td>{item}</td>
                  <td>{due || "no fixed date"}</td>
                  <td><span className={`tagp ${status.tone}`}>{status.label}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </>
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
