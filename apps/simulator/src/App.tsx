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
  nextWeekRange,
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
      var text=node.textContent||"";
      if(text==="Certified")node.classList.add("cert");
      if(text.indexOf("Over $60 limit")===0)node.classList.add("limit");
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

/** Checkout and receipt skins. The server document stays the source of the lines, totals, dates, and buttons. */
const QUOTE_SKIN = `<style>
body:has(main[data-card="checkout"]),body:has(main[data-card="receipt"]){background:transparent;color:#14301F;font-family:Figtree,Nunito,"Segoe UI",sans-serif;position:relative}
body:has(main[data-card="checkout"])>.chip,body:has(main[data-card="receipt"])>.chip{position:absolute;top:16px;right:16px;z-index:1;margin:0;height:30px;display:inline-flex;align-items:center;padding:0 12px;border-radius:999px;background:#D5F3DF;color:#0B7039;font-size:13px;font-weight:600;letter-spacing:0}
main[data-card="checkout"],main[data-card="receipt"]{padding:18px 20px 16px;overflow-wrap:anywhere}
main[data-card="checkout"] .card-h,main[data-card="receipt"] .card-h{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;min-height:32px;padding-right:148px}
main[data-card="checkout"] .eyebrow,main[data-card="receipt"] .eyebrow{font:600 12px/1 Figtree,Nunito,"Segoe UI",sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#4F6353}
main[data-card="checkout"] .meta,main[data-card="receipt"] .meta{font-size:14px;color:#4F6353;font-weight:500}
main[data-card="checkout"] .i,main[data-card="receipt"] .i{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round;flex:none}
main[data-card="checkout"] .lines,main[data-card="receipt"] .lines{margin:12px 0 0;border-top:1px solid #D9E2CC;border-bottom:1px solid #D9E2CC;padding:12px 0;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 16px;align-items:baseline}
main[data-card="checkout"] .nm,main[data-card="receipt"] .nm{font-size:22px;font-weight:600;min-width:0}
main[data-card="checkout"] .qty,main[data-card="receipt"] .qty{color:#4F6353;font-weight:500}
main[data-card="checkout"] .pr,main[data-card="receipt"] .pr{font-size:22px;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}
main[data-card="checkout"] .sb,main[data-card="receipt"] .sb{grid-column:1 / -1;font-size:20px;line-height:1.3;color:#4F6353;min-width:0}
main[data-card="checkout"] .sum,main[data-card="receipt"] .sum{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px;margin-top:14px;align-items:end}
main[data-card="checkout"] .sumline,main[data-card="receipt"] .sumline{display:flex;flex-direction:column;align-items:flex-start;margin:0;min-width:0}
main[data-card="checkout"] .lab,main[data-card="receipt"] .lab{font-size:20px;color:#4F6353;font-weight:500}
main[data-card="checkout"] .tot,main[data-card="receipt"] .tot{font:700 46px/1 Figtree,Nunito,"Segoe UI",sans-serif;letter-spacing:-.025em;margin-top:4px;color:#14301F}
main[data-card="checkout"] .when,main[data-card="receipt"] .when{display:flex;align-items:center;gap:12px;justify-self:end;text-align:right;font-size:22px;font-weight:600;min-width:0}
main[data-card="checkout"] .when p,main[data-card="receipt"] .when p{margin:0;min-width:0}
main[data-card="checkout"] .ic,main[data-card="receipt"] .ic{width:46px;height:46px;border-radius:14px;background:#EAF1DE;display:grid;place-items:center;flex:none}
main[data-card="checkout"] .ic .i,main[data-card="receipt"] .ic .i{width:24px;height:24px}
main[data-card="checkout"] .limit{margin-top:16px}
main[data-card="checkout"] .lt{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;font-size:20px;font-weight:600}
main[data-card="checkout"] .st{display:inline-flex;align-items:flex-start;gap:8px;min-width:0}
main[data-card="checkout"] .st .i{width:22px;height:22px;stroke-width:2.2;margin-top:1px}
main[data-card="checkout"] .limit.ok .st{color:#0B7039}
main[data-card="checkout"] .limit.over .st{color:#B3172F}
main[data-card="checkout"] .of{font-size:16px;color:#4F6353;font-weight:500;font-variant-numeric:tabular-nums;white-space:nowrap;flex:none}
main[data-card="checkout"] .bar{position:relative;height:12px;border-radius:999px;background:#EAF1DE;margin-top:10px}
main[data-card="checkout"] .limit.over .bar{margin-bottom:22px}
main[data-card="checkout"] .bar .f{position:absolute;left:0;top:0;bottom:0;border-radius:999px;background:#1FA85B}
main[data-card="checkout"] .limit.over .bar .f{border-radius:999px 0 0 999px}
main[data-card="checkout"] .bar .o{position:absolute;top:0;bottom:0;right:0;border-radius:0 999px 999px 0;background:repeating-linear-gradient(135deg,#EE4258 0 6px,#F26A7C 6px 12px)}
main[data-card="checkout"] .bar .cap{position:absolute;top:-6px;bottom:-6px;width:3px;border-radius:2px;background:#14301F}
main[data-card="checkout"] .bar .capl{position:absolute;top:16px;transform:translateX(-50%);font-size:13px;font-weight:600;color:#14301F;white-space:nowrap}
main[data-card="checkout"] .saybar{margin-top:16px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px;align-items:stretch}
main[data-card="checkout"] .say{background:#FFF3BF;border-radius:20px;padding:14px 18px;box-shadow:inset 0 0 0 1.5px #F2B705;min-width:0}
main[data-card="checkout"] .say .eyebrow{color:#6E5200;font-size:11px}
main[data-card="checkout"] .q{display:block;margin:6px 0 0;font:700 26px/1.15 Figtree,Nunito,"Segoe UI",sans-serif;letter-spacing:-.012em;color:#14301F}
main[data-card="checkout"] .q::before{content:"“"}
main[data-card="checkout"] .q::after{content:"”"}
main[data-card="checkout"] .mock{display:flex;align-items:flex-start;gap:6px;margin:6px 0 0;font-size:16px;line-height:1.35;font-weight:500;color:#14301F}
main[data-card="checkout"] .mock .i{width:15px;height:15px;margin-top:3px}
main[data-card="checkout"] .acts{display:flex;flex-direction:column;gap:8px;justify-content:center;width:210px}
main[data-card="checkout"] button{height:52px;min-height:44px;border-radius:999px;font-size:20px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:8px;border:1.5px solid #14301F;background:#FFFEF8;color:#14301F;padding:0 14px;white-space:nowrap}
main[data-card="checkout"] button.primary{background:#FF6A2B;border-color:#FF6A2B;color:#14301F}
main[data-card="checkout"] button .i{width:20px;height:20px}
main[data-card="checkout"] button:focus-visible{outline:none;box-shadow:0 0 0 3px #FFFEF8,0 0 0 5px #0B7039}
main[data-card="checkout"] button:active{transform:scale(.97)}
main[data-card="checkout"].svc{padding:12px 16px 8px}
main[data-card="checkout"].svc .card-h{min-height:22px}
main[data-card="checkout"].svc .lines{margin-top:6px;padding:6px 0}
main[data-card="checkout"].svc .nm,main[data-card="checkout"].svc .pr{font-size:20px}
main[data-card="checkout"].svc .sum{align-items:center;margin-top:6px;grid-template-columns:auto minmax(0,1fr)}
main[data-card="checkout"].svc .when{font-size:20px;gap:8px}
main[data-card="checkout"].svc .ic{width:36px;height:36px;border-radius:12px}
main[data-card="checkout"].svc .sumline{flex-direction:row;align-items:baseline;gap:10px}
main[data-card="checkout"].svc .tot{font-size:36px;margin-top:0}
main[data-card="checkout"].svc .limit{margin-top:6px}
main[data-card="checkout"].svc .limit.over .bar{margin-bottom:16px}
main[data-card="checkout"].svc .say{padding:8px 14px}
main[data-card="checkout"].svc .q{font-size:20px;margin-top:2px}
main[data-card="checkout"].svc .saybar{margin-top:6px}
main[data-card="checkout"].svc .acts{gap:6px}
main[data-card="checkout"].svc button{height:40px;font-size:18px}
main[data-card="receipt"] .oid{margin:10px 0 0;font:700 28px/1.1 Figtree,Nunito,"Segoe UI",sans-serif;letter-spacing:-.02em}
main[data-card="receipt"] .steps{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 0}
main[data-card="receipt"] .step{display:inline-flex;align-items:center;min-height:36px;padding:4px 12px;border-radius:999px;background:#EAF1DE;color:#14301F;font-size:20px;font-weight:600}
main[data-card="receipt"] .step.active{background:#D5F3DF;color:#0B7039;box-shadow:inset 0 0 0 1.5px #1FA85B}
main[data-card="receipt"] .mock{display:flex;align-items:flex-start;gap:8px;margin:16px 0 0;padding:12px 16px;border-radius:20px;background:#FFF3BF;box-shadow:inset 0 0 0 1.5px #F2B705;font-size:20px;font-weight:600;line-height:1.35}
main[data-card="receipt"].booked{padding:12px 16px 10px}
main[data-card="receipt"].booked .oid{margin-top:4px;font-size:24px}
main[data-card="receipt"].booked .steps{margin-top:8px}
main[data-card="receipt"].booked .lines{margin-top:8px;padding:8px 0}
main[data-card="receipt"].booked .sum{margin-top:8px}
main[data-card="receipt"].booked .tot{font-size:36px}
main[data-card="receipt"].booked .mock{margin-top:8px;padding:8px 12px}
main[data-card="receipt"] .mock .i{width:18px;height:18px;margin-top:3px}
@media (max-width:480px){
main[data-card="checkout"] .saybar,main[data-card="checkout"] .sum,main[data-card="receipt"] .sum{grid-template-columns:minmax(0,1fr)}
main[data-card="checkout"] .acts{width:100%}
main[data-card="checkout"] .when,main[data-card="receipt"] .when{justify-self:start;text-align:left}
main[data-card="checkout"] .of{white-space:normal}
}
@media (prefers-reduced-motion:reduce){main[data-card="checkout"] button:active{transform:none}}
</style>
<script>
(function(){
var CHECK='<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"></path></svg>';
var INFO='<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 11v5.5M12 7.8v.2"></path></svg>';
var TRUCK='<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6.5h11v10H3z"></path><path d="M14 10h4l3 3.2v3.3h-7"></path><circle cx="7" cy="17.5" r="1.8"></circle><circle cx="17.5" cy="17.5" r="1.8"></circle></svg>';
var CAL='<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5.5" width="16" height="14.5" rx="2.5"></rect><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"></path><path d="M8 14h3"></path></svg>';
var MIC='<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11.5" rx="3"></rect><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"></path></svg>';
var XIC='<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"></path></svg>';
var MOCK='Mock order, no real purchase or payment';
function esc(value){return String(value==null?'':value).split('&').join('&amp;').split('<').join('&lt;').split('>').join('&gt;');}
function money(value,force){var n=Number(value);if(!isFinite(n))return '';if(!force&&Math.abs(n-Math.round(n))<0.001)return '$'+Math.round(n);return '$'+n.toFixed(2);}
function usd(value){var n=Number(value);return isFinite(n)?'$'+n.toFixed(2):'';}
function wholeCap(value){var text=usd(value);return text.slice(-3)==='.00'?text.slice(0,-3):text;}
function phrase(item){var raw=String(item||'');var text=raw==='air_filter'?'filter':raw.split('_').join(' ');if(!text)return '';return text.charAt(0).toUpperCase()+text.slice(1);}
function whoOf(context,id){var names=(context&&context.applianceNames)||{};return String((id&&names[id])||'');}
function titled(who,item){var left=who?who.charAt(0).toUpperCase()+who.slice(1):'';var right=item?item.toLowerCase():'';if(left&&right)return left+' '+right;return left||right;}
function held(iso){var text=String(iso||'');var hour=Number(text.slice(11,13));var minute=text.slice(14,16);if(!isFinite(hour)||minute.length!==2)return '';var ap=hour>=12?'PM':'AM';var h=hour%12;if(h===0)h=12;return '· price held until '+h+':'+minute+' '+ap;}
function sumHtml(totalText){if(!totalText)return '';var space=totalText.indexOf(' ');if(space<0)return '<p class="sumline">'+esc(totalText)+'</p>';return '<p class="sumline"><span class="lab">'+esc(totalText.slice(0,space))+'</span> <span class="tot">'+esc(totalText.slice(space+1))+'</span></p>';}
function linesHtml(lines,context,aside){var html='';var list=Array.isArray(lines)?lines:[];for(var i=0;i<list.length;i++){var line=list[i]||{};var service=line.type==='service'||(!line.name&&line.provider);var who=whoOf(context,line.forApplianceId||line.applianceId);var item=phrase(line.item);var name='';var detail='';var sub='';if(service){name=titled(who,item)||line.provider||line.name||'Line';if(line.provider&&String(name).indexOf(String(line.provider))<0)detail=' · '+line.provider;}else{name=line.name||line.provider||'Line';var qty=Number(line.qty);if(isFinite(qty)&&qty>0)detail=' × '+qty;if(item&&who)sub=item+' for your '+who;}if(!sub&&i===0&&aside){var shown=String(name)+detail;var extra=aside.split(' · ').map(function(part){return part.trim();}).filter(function(part){return part&&shown.indexOf(part)<0;});if(extra.length)sub=extra.join(' · ');}var raw=line.lineTotalUsd||line.priceUsd;var price=raw==null||raw===''?'':money(raw,true);html+='<span class="nm">'+esc(name)+(detail?'<span class="qty">'+esc(detail)+'</span>':'')+'</span><span class="pr">'+esc(price)+'</span>';if(sub)html+='<span class="sb">'+esc(sub)+'</span>';}return html;}
function barHtml(data){var total=Number(data.totalUsd);var cap=Number(data.capUsd);if(!(total>0)||!(cap>0))return '';if(data.overCap===true){var leaf=Math.max(0,Math.min(100,(cap/total)*100));var over=Math.max(0,100-leaf);var labelAt=Math.max(18,Math.min(82,leaf));var label=wholeCap(data.capUsd)+' limit';return '<div class="bar" aria-hidden="true"><span class="f" style="width:'+leaf.toFixed(1)+'%"></span><span class="o" style="width:'+over.toFixed(1)+'%"></span><span class="cap" style="left:calc('+leaf.toFixed(1)+'% - 1.5px)"></span><span class="capl" style="left:'+labelAt.toFixed(1)+'%">'+esc(label)+'</span></div>';}var width=Math.max(0,Math.min(100,(total/cap)*100));return '<div class="bar" aria-hidden="true"><span class="f" style="width:'+width.toFixed(1)+'%"></span></div>';}
function meterOf(data){var left=usd(data.totalUsd);var right=usd(data.capUsd);if(!left||!right)return '';return data.overCap===true?left+' vs '+right:left+' of '+right;}
function whenHtml(text,icon){if(!text)return '';return '<div class="when"><p>'+esc(text)+'</p><span class="ic">'+icon+'</span></div>';}
window.dressCheckout=function(data,context){
  var main=document.querySelector('main[data-card="checkout"]');
  if(!main||main.querySelector('.saybar'))return;
  var voice=main.querySelector('#voice');
  var cancel=main.querySelector('#cancel');
  if(!voice||!cancel)return;
  var park=document.createElement('div');
  park.appendChild(voice);
  park.appendChild(cancel);
  var paras=[].slice.call(main.querySelectorAll('p')).filter(function(p){return !p.querySelector('button');}).map(function(p){return p.textContent||'';});
  var total='';var arrives='';var limit='';var say='';var rest=[];
  for(var i=0;i<paras.length;i++){var text=paras[i];if(!total&&text.indexOf('Total ')===0)total=text;else if(!arrives&&text.indexOf('Arrives ')===0)arrives=text;else if(!limit&&(text.indexOf('Within your ')===0||text.indexOf('Over your ')===0))limit=text;else if(!say&&text.indexOf('Say ')===0)say=text;else rest.push(text);}
  var when=arrives||(rest.length?rest.shift():'');
  var aside=rest.join(' · ');
  var service=data.kind==='service'||!!data.slot;
  var over=data.overCap===true||limit.indexOf('Over your ')===0;
  var lineHtml=linesHtml(data.lines,context,aside);
  if(!lineHtml){var lis=[].slice.call(main.querySelectorAll('ul li')).map(function(li){return {name:li.textContent||''};});lineHtml=linesHtml(lis,context,'');}
  var meta=service?'· mock booking, no real payment':held(data.expiresAt);
  var eyebrow=service?'Booking · nothing booked yet':'Checkout · nothing bought yet';
  var ofText=meterOf(data);
  voice.classList.add('act','primary');
  cancel.classList.add('act');
  if(!voice.querySelector('svg'))voice.insertAdjacentHTML('afterbegin',MIC);
  if(!cancel.querySelector('svg'))cancel.insertAdjacentHTML('afterbegin',XIC);
  main.classList.toggle('svc',service);
  main.innerHTML='<div class="card-h"><span class="eyebrow">'+esc(eyebrow)+'</span>'+(meta?'<span class="meta">'+esc(meta)+'</span>':'')+'</div>'+(lineHtml?'<div class="lines">'+lineHtml+'</div>':'')+'<div class="sum'+(service?' compact':'')+'">'+sumHtml(total)+whenHtml(when,arrives?TRUCK:CAL)+'</div>'+(limit?'<div class="limit '+(over?'over':'ok')+'"><div class="lt"><span class="st">'+(over?INFO:CHECK)+esc(limit)+'</span>'+(ofText?'<span class="of">'+esc(ofText)+'</span>':'')+'</div>'+barHtml(data)+'</div>':'')+(say?'<div class="saybar"><div class="say"><span class="eyebrow">What to say</span><p class="q">'+esc(say)+'</p>'+(service?'':'<p class="mock">'+INFO+esc(MOCK)+'</p>')+'</div><div class="acts"></div></div>':'');
  var acts=main.querySelector('.acts');
  if(acts){acts.appendChild(voice);acts.appendChild(cancel);}else{main.appendChild(voice);main.appendChild(cancel);}
};
window.dressReceipt=function(data,context){
  var main=document.querySelector('main[data-card="receipt"]');
  if(!main||main.querySelector('.card-h'))return;
  var steps=main.querySelector('.steps');
  var park=document.createElement('div');
  if(steps)park.appendChild(steps);
  var paras=[].slice.call(main.querySelectorAll('p')).map(function(p){return p.textContent||'';});
  var id=paras.length?paras[0]:'';
  var total='';var mock='';var when='';
  for(var i=1;i<paras.length;i++){var text=paras[i];if(text.indexOf('Total ')===0)total=text;else if(text.indexOf('Mock order')===0)mock=text;else if(!when)when=text;}
  var lines=(context&&Array.isArray(context.lines)&&context.lines.length)?context.lines:(Array.isArray(data.lines)?data.lines:[]);
  var lineHtml=linesHtml(lines,context,'');
  if(!lineHtml){var lis=[].slice.call(main.querySelectorAll('ul li')).map(function(li){return {name:li.textContent||''};});lineHtml=linesHtml(lis,context,'');}
  var service=data.kind==='booking'||!!data.slot||!!data.bookingId;
  main.classList.toggle('booked',service);
  var eyebrow=service?'Booking':'Order';
  main.innerHTML='<div class="card-h"><span class="eyebrow">'+esc(eyebrow)+'</span></div><p class="oid">'+esc(id)+'</p><div class="stepslot"></div>'+(lineHtml?'<div class="lines">'+lineHtml+'</div>':'')+'<div class="sum">'+sumHtml(total)+whenHtml(when,service?CAL:TRUCK)+'</div><p class="mock">'+INFO+esc(mock||MOCK)+'</p>';
  var slot=main.querySelector('.stepslot');
  if(steps&&slot)slot.replaceWith(steps);else if(slot)slot.remove();
};
window.addEventListener('message',function(event){
  var data=event.data;
  if(!data||data.source!=='hearthkeep-host'||data.type!=='tool-result')return;
  window.dressCheckout(data.structuredContent||{},data.context||{});
  window.dressReceipt(data.structuredContent||{},data.context||{});
});
})();
</script>`;

function hostDocument(html: string): string {
  const withPolicy = html.includes("Content-Security-Policy")
    ? html
    : html.replace("<head>", () => `<head><meta http-equiv="Content-Security-Policy" content="${CARD_CSP}">`);
  if (withPolicy.includes("hk-ring")) return withPolicy;
  // A string replacement treats $' as the text after the match, which rewrote price prefixes.
  return withPolicy.replace("</body>", () => `${STATUS_SKIN}${OPTIONS_SKIN}${QUOTE_SKIN}</body>`);
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

/** Trace raw JSON stays at 34 characters per line so the 324px panel does not clip it. */
function foldLine(line: string, width: number): string {
  const parts: string[] = [];
  let rest = line;
  while (rest.length > width) {
    let cut = -1;
    const last = Math.min(width, rest.length);
    for (let index = last; index >= 1; index -= 1) {
      const ch = rest.charAt(index - 1);
      if (" ,:{}[]\"".includes(ch)) {
        cut = ch === " " ? index - 1 : index;
        break;
      }
    }
    if (cut <= 0) cut = width;
    const piece = rest.slice(0, cut).replace(/[ \t]+$/u, "");
    if (piece.length === 0) {
      parts.push(rest.slice(0, width));
      rest = rest.slice(width);
      continue;
    }
    parts.push(piece);
    rest = rest.slice(cut).replace(/^[ \t]+/u, "");
  }
  if (rest.length > 0) parts.push(rest);
  return parts.join("\n");
}

function foldJson(value: unknown, width = 34): string {
  const pretty = JSON.stringify(value, null, 2);
  if (pretty === undefined) return "";
  return pretty
    .split("\n")
    .map((line) => foldLine(line, width))
    .join("\n");
}

interface ProSlot {
  id: string;
  date: string;
  day: string;
  windowLabel: string;
  price: string;
  provider: string;
  overCap: boolean;
}

function clockHour(iso: string): { hour: number; ap: "AM" | "PM" } {
  const hour24 = Number(iso.slice(11, 13));
  const ap = hour24 >= 12 ? "PM" : "AM";
  let hour = hour24 % 12;
  if (hour === 0) hour = 12;
  return { hour: Number.isFinite(hour) ? hour : 0, ap };
}

/** Same window text as the slot tiles: "9-11 AM" or "10 AM-12 PM". */
function slotWindow(start: string, end: string): string {
  const open = clockHour(start);
  const close = clockHour(end);
  if (open.ap === close.ap) return `${open.hour}-${close.hour} ${open.ap}`;
  return `${open.hour} ${open.ap}-${close.hour} ${close.ap}`;
}

function moneyShort(value: unknown): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "";
  if (Math.abs(amount - Math.round(amount)) < 0.001) return `$${Math.round(amount)}`;
  return `$${amount.toFixed(2)}`;
}

function readProSlots(content: Record<string, unknown>): ProSlot[] {
  if (!Array.isArray(content.slots)) return [];
  const slots: ProSlot[] = [];
  for (const row of content.slots.slice(0, 3)) {
    if (row === null || typeof row !== "object") continue;
    const slot = row as Record<string, unknown>;
    const id = typeof slot.slotId === "string" ? slot.slotId : "";
    const date = typeof slot.date === "string" ? slot.date.slice(0, 10) : "";
    if (id === "" || date === "") continue;
    slots.push({
      id,
      date,
      day: formatShortDate(date),
      windowLabel: slotWindow(String(slot.start ?? ""), String(slot.end ?? "")),
      price: moneyShort(slot.priceUsd),
      provider: typeof slot.provider === "string" ? slot.provider : "",
      overCap: slot.overCap === true,
    });
  }
  return slots;
}

function recordSlot(content: Record<string, unknown>): string {
  const slot = content.slot;
  if (slot === null || typeof slot !== "object" || Array.isArray(slot)) return "";
  const id = (slot as Record<string, unknown>).slotId;
  return typeof id === "string" ? id : "";
}

function bookingCard(card: CardPayload | null): boolean {
  if (card === null) return false;
  if (recordSlot(card.structuredContent) !== "") return true;
  return card.structuredContent.kind === "booking" || typeof card.structuredContent.bookingId === "string";
}

function firstLine(value: unknown): Record<string, unknown> | null {
  if (!Array.isArray(value) || value[0] === null || typeof value[0] !== "object") return null;
  return value[0] as Record<string, unknown>;
}

function serviceDetail(card: CardPayload | null, appliance: string): string {
  const line = firstLine(card?.structuredContent.lines) ?? firstLine(card?.context.lines);
  const rawItem = line && typeof line.item === "string" ? line.item : typeof card?.context.item === "string" ? card.context.item : "";
  const item = rawItem.replaceAll("_", " ");
  const applianceId = line && typeof line.applianceId === "string" ? line.applianceId : "";
  const names = card?.context.applianceNames;
  const spoken =
    applianceId !== "" && names !== null && typeof names === "object" && !Array.isArray(names)
      ? String((names as Record<string, unknown>)[applianceId] ?? "")
      : "";
  return [spoken || appliance, item].filter((part) => part !== "").join(" ");
}

function openingsEyebrow(slots: ProSlot[], clockIso: string, detail: string): string {
  const today = clockIso.slice(0, 10);
  const range = /^\d{4}-\d{2}-\d{2}$/.test(today) ? nextWeekRange(today) : null;
  const nextWeek = range !== null && slots.length > 0 && slots.every((slot) => slot.date >= range.from && slot.date <= range.to);
  const when = nextWeek ? "Openings next week" : "Openings";
  return detail === "" ? when : `${when} · ${detail}`;
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
  const [proSlots, setProSlots] = useState<ProSlot[]>([]);
  const [slotAppliance, setSlotAppliance] = useState("");
  const [approveLock, setApproveLock] = useState(false);
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

  function rememberSlots(next: CardPayload): void {
    const slots = readProSlots(next.structuredContent);
    if (slots.length === 0) return;
    const appliance = typeof next.context.fitsLine === "string" ? next.context.fitsLine : "";
    setProSlots(slots);
    setSlotAppliance(appliance);
  }

  function noteApproveLock(next: CardPayload | null): void {
    if (next === null) return;
    const service = recordSlot(next.structuredContent) !== "";
    setApproveLock(service && next.structuredContent.overCap === true);
  }

  async function showCard(next: CardPayload | null): Promise<void> {
    if (next === null) {
      setCard(null);
      setCardHtml("");
      return;
    }
    rememberSlots(next);
    noteApproveLock(next);
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
      setProSlots([]);
      setSlotAppliance("");
      setApproveLock(false);
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
      setProSlots([]);
      setSlotAppliance("");
      setApproveLock(false);
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
  const showSlotStrip = showCards && proSlots.length > 0 && bookingCard(card);
  const pickedId = recordSlot(card?.structuredContent ?? {});
  const approveCode = awaitingCode && approveLock;
  const slotEyebrow = openingsEyebrow(proSlots, clockIso, serviceDetail(card, slotAppliance));

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
              <div className={awaitingCode ? `composer is-locked${approveCode ? " approve" : ""}` : "composer"}>
                {awaitingCode ? <CodeLock /> : null}
                <input
                  id="say"
                  value={draft}
                  disabled={busy || connection === "down"}
                  placeholder={approveCode ? "Waiting for “approve” and your code" : awaitingCode ? "Waiting for your purchase code" : "Type what you'd say..."}
                  onChange={(event) => setDraft(event.target.value)}
                />
                {draft === "" ? (
                  <span className="hint">
                    {approveCode ? (
                      <>
                        Digits show as •••• · sent only to <span className="mono">confirm_purchase</span>
                      </>
                    ) : awaitingCode ? (
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
          <div className={showSlotStrip ? "stage has-slots" : "stage"} aria-label="Card">
            {showSlotStrip ? (
              <section className="slot-strip" aria-label="Earlier card: service slot options">
                <span className="eyebrow">{slotEyebrow}</span>
                <div className="mini">
                  {proSlots.map((slot) => (
                    <div key={slot.id} className={slot.id === pickedId ? "mt pick" : "mt"}>
                      <div className="l1"><span className="day">{slot.day}</span><span>{slot.price}</span></div>
                      <div className="l2">{slot.windowLabel}</div>
                      <div className="l3">{slot.id === pickedId ? <Icon name="check" /> : null}{slot.provider}</div>
                      {slot.overCap ? <span className="bd">Over $60 limit</span> : null}
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
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
                        <pre className="trace-json">{foldJson({ request: step.rawRequest, response: step.rawResponse, args: step.args })}</pre>
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
