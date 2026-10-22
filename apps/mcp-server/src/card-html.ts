/**
 * Self-contained MCP Apps card documents. Fictional household data only.
 * Scripts post intents to the host. They never call tools or the network.
 */

const CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'";

const CSS = [
  "body{margin:0;min-width:320px;background:#f4efe6;color:#1c1917;font:20px/1.35 'Segoe UI',sans-serif}",
  "main{padding:16px}",
  "h2{font-size:22px;margin:16px 0 8px}",
  ".chip{display:inline-block;margin:10px 0 0 16px;padding:2px 10px;border-radius:999px;background:#143d2c;color:#fff;font-size:20px;font-weight:700}",
  ".empty{font-size:22px}",
  "ul{list-style:none;margin:0;padding:0}",
  "li,p{margin:0 0 10px}",
  "button{font:20px/1.2 'Segoe UI',sans-serif;background:#143d2c;color:#fff;border:0;border-radius:10px;padding:10px 14px;min-height:44px}",
  ".row button{flex:0 0 auto;white-space:nowrap}",
  "button:focus-visible{outline:3px solid #1d4ed8;outline-offset:2px}",
  ".row{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:10px}",
  ".tiles{display:flex;gap:12px;overflow:auto;padding-bottom:8px}",
  ".tile{flex:1 0 calc(50% - 8px);min-width:calc(50% - 8px);box-sizing:border-box;text-align:left;background:#fffdf8;color:#1c1917;border:2px solid #d6cbb8;white-space:normal;overflow-wrap:break-word;padding:12px}",
  ".tile strong,.tile>span:not(.badges){display:block;margin-top:4px}",
  ".tile strong{font-size:22px;margin-top:0}",
  ".badges{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}",
  ".badge{background:#efe6d6;border-radius:999px;padding:2px 8px;font-size:20px}",
  ".badge.limit{background:#7f1d1d;color:#fff}",
  ".foot{margin-top:12px}",
  ".steps{display:flex;gap:8px;flex-wrap:wrap}",
  ".step{padding:4px 8px;border-radius:8px;background:#e7dcc8}",
  ".step.active{background:#143d2c;color:#fff}",
  ".warn{font-weight:700}",
  "@media (prefers-reduced-motion: reduce){*{animation:none !important;transition:none !important}}",
].join("");

const BRIDGE = [
  "const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];",
  "const DAYS=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];",
  "const WEEK=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];",
  "function ymdParts(ymd){const bits=String(ymd||'').slice(0,10).split('-').map(Number);const wd=new Date(Date.UTC(bits[0],bits[1]-1,bits[2])).getUTCDay();return {m:bits[1],d:bits[2],wd};}",
  "function shortDate(ymd){const p=ymdParts(ymd);return DAYS[p.wd]+', '+MONTHS[p.m-1]+' '+p.d;}",
  "function longWeekday(ymd){return WEEK[ymdParts(ymd).wd];}",
  "function money(value,force){const n=Number(value);if(!Number.isFinite(n))return '$0.00';if(!force&&Math.abs(n-Math.round(n))<0.001)return '$'+Math.round(n);return '$'+n.toFixed(2);}",
  "function humanItem(item){if(item==='air_filter')return 'filter';return String(item||'').replaceAll('_',' ');}",
  "function sentence(value){const text=String(value||'').trim();if(!text)return '';return text.charAt(0).toUpperCase()+text.slice(1);}",
  "function clockHour(iso){const hour=Number(String(iso).slice(11,13));const ap=hour>=12?'PM':'AM';let h=hour%12;if(h===0)h=12;return {h,ap};}",
  "function windowShort(start,end){const a=clockHour(start);const b=clockHour(end);if(a.ap===b.ap)return a.h+'-'+b.h+' '+a.ap;return a.h+' '+a.ap+'-'+b.h+' '+b.ap;}",
  "function daypart(iso){const hour=Number(String(iso).slice(11,13));if(hour<12)return 'morning';if(hour<17)return 'afternoon';return 'evening';}",
  "function postIntent(utterance){parent.postMessage({source:'hearthkeep-card',type:'intent',utterance:utterance},'*');}",
  "function namesOf(context){return (context&&context.applianceNames)||{};}",
  "const main=document.querySelector('main');",
].join("");

function documentFor(title: string, marker: string, renderBody: string): string {
  const script = `${BRIDGE}${renderBody}globalThis.renderCard=render;let hearthkeepSeen=false;window.addEventListener('message',function(event){const data=event.data;if(!data||data.source!=='hearthkeep-host'||data.type!=='tool-result')return;hearthkeepSeen=true;render(data.structuredContent||{},data.context||{},data.tool||'');});function hearthkeepReady(){if(!hearthkeepSeen)parent.postMessage({source:'hearthkeep-card',type:'ready'},'*');}hearthkeepReady();if(typeof setInterval==='function'){const hearthkeepTimer=setInterval(function(){if(hearthkeepSeen){clearInterval(hearthkeepTimer);return;}hearthkeepReady();},100);}`;
  return [
    "<!DOCTYPE html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${CSP}">`,
    `<title>${title}</title>`,
    `<style>${CSS}</style>`,
    "</head>",
    "<body>",
    '<p class="chip">Fictional data</p>',
    `<main data-card="${marker}"></main>`,
    `<script>${script}</script>`,
    "</body>",
    "</html>",
  ].join("");
}

const STATUS_RENDER = [
  "function labelFor(row,context){const spoken=row.spokenName||namesOf(context)[row.applianceId]||'';const item=humanItem(row.item||'');if(spoken&&item)return sentence(spoken+' '+item);return sentence(row.name||spoken||item||'Item');}",
  "function attentionLine(row,context){const phrase=row.bucket==='due_today'?'due today':(Number(row.daysOverdue)===1?'1 day overdue':Number(row.daysOverdue||0)+' days overdue');return labelFor(row,context)+', '+phrase;}",
  "function progressLine(row,context){if(row.kind==='order')return (row.name||'Order')+' ('+sentence(row.status||'')+')';const spoken=namesOf(context)[row.applianceId]||'';const item=humanItem(row.item||row.name||'');const label=spoken?sentence(spoken+' '+item):sentence(row.name||item);const when=row.windowStart?shortDate(row.windowStart):'';return when?label+' ('+when+')':label;}",
  "function handleIntent(row){const spoken=row.spokenName||'it';if(row.item==='water_filter'||row.item==='air_filter')return 'Order a new filter for the '+spoken;if(row.item==='vent_cleaning')return 'Book someone to clean the '+spoken+' vent';if(row.item==='battery')return 'The '+spoken+' needs a battery';return 'Handle the '+spoken;}",
  "function render(data,context){const attention=data.attention||[];const upcoming=data.upcoming||[];const progress=data.inProgress||[];const tasks=data.tasks||[];if(!attention.length&&!upcoming.length&&!progress.length&&!tasks.length){main.innerHTML='<p class=\"empty\">All caught up</p>';return;}let html='';",
  "if(attention.length){html+='<section><h2>Needs attention</h2><ul>';attention.forEach(function(row){html+='<li class=\"row\"><span>'+attentionLine(row,context)+'</span><button type=\"button\" data-intent=\"'+handleIntent(row).replaceAll('\"','')+'\">Handle it</button></li>';});html+='</ul></section>';}",
  "if(upcoming.length){html+='<section><h2>Coming up</h2><ul>';upcoming.forEach(function(row){html+='<li>'+labelFor(row,context)+', '+shortDate(row.due)+'</li>';});html+='</ul></section>';}",
  "if(progress.length){html+='<section><h2>On the way / Booked</h2><ul>';progress.forEach(function(row){html+='<li>'+progressLine(row,context)+'</li>';});html+='</ul></section>';}",
  "if(tasks.length){html+='<section><h2>Open tasks</h2><ul>';tasks.forEach(function(row){html+='<li>'+sentence(row.title||'Task')+(row.dueDate?', '+shortDate(row.dueDate):'')+'</li>';});html+='</ul></section>';}",
  "main.innerHTML=html;main.querySelectorAll('button').forEach(function(button){button.addEventListener('click',function(){postIntent(button.getAttribute('data-intent')||'');});});}",
].join("");

const OPTIONS_RENDER = [
  "function badges(option){const list=[];if(option.kind==='oem')list.push('OEM');if(option.kind==='compatible')list.push('Compatible');if(option.kind==='generic')list.push('Generic');if(option.certified===true)list.push('Certified');if(option.recommended===true)list.push('Recommended');if(option.overCap===true)list.push('Over $60 limit');return list;}",
  "function reasonText(reason){if(reason==='POLICY_UNCERTIFIED')return 'not certified (your rules)';if(reason==='EXCEEDS_MAKER_SPEC')return 'above the maker spec (your rules)';return 'excluded by your rules';}",
  "function tile(title,line,price,extra,badgeList,intent){const badgesHtml=badgeList.map(function(badge){const cls=badge.indexOf('Over')===0?'badge limit':'badge';return '<span class=\"'+cls+'\">'+badge+'</span>';}).join('');return '<button type=\"button\" class=\"tile\" data-tile=\"1\" data-intent=\"'+intent.replaceAll('\"','')+'\"><strong>'+title+'</strong><span>'+line+'</span><span>'+price+'</span><span>'+(extra||'')+'</span><span class=\"badges\">'+badgesHtml+'</span></button>';}",
  "function render(data,context){const options=data.options||[];const slots=data.slots||[];let html='<div class=\"tiles\">';",
  "options.slice(0,3).forEach(function(option){const eta=option.eta?'Arrives '+shortDate(option.eta):'';html+=tile(option.name,context.fitsLine||option.brand||'',money(option.priceUsd,true),eta,badges(option),'Choose '+option.name);});",
  "slots.slice(0,3).forEach(function(slot){const title=shortDate(slot.date)+', '+windowShort(slot.start,slot.end);const intent=longWeekday(slot.date)+' '+daypart(slot.start);html+=tile(title,slot.provider,money(slot.priceUsd,true),'',badges(slot),intent);});",
  "html+='</div>';const excluded=data.excluded||[];if(excluded.length){html+='<p class=\"foot\">Not shown: '+excluded.map(function(row){return row.name+', '+reasonText(row.reason);}).join('; ')+'</p>';}",
  "main.innerHTML=html;const tiles=[].slice.call(main.querySelectorAll('[data-tile]'));tiles.forEach(function(button){button.addEventListener('click',function(){postIntent(button.getAttribute('data-intent')||'');});});",
  "document.addEventListener('keydown',function(event){if((event.key==='Enter'||event.key===' ')&&tiles.indexOf(document.activeElement)>=0){event.preventDefault();document.activeElement.click();return;}if(event.key!=='ArrowRight'&&event.key!=='ArrowLeft')return;if(!tiles.length)return;event.preventDefault();let index=tiles.indexOf(document.activeElement);if(index<0)index=event.key==='ArrowRight'?-1:0;const next=event.key==='ArrowRight'?index+1:index-1;tiles[(next+tiles.length)%tiles.length].focus();});}",
].join("");

const CHECKOUT_RENDER = [
  "function render(data){const lines=data.lines||[];let html='<ul>';lines.forEach(function(line){const name=line.name||line.provider||'Line';html+='<li>'+name+' '+money(line.lineTotalUsd||line.priceUsd,true)+'</li>';});html+='</ul>';",
  "html+='<p>Total '+money(data.totalUsd,true)+'</p>';",
  "if(data.eta)html+='<p>Arrives '+shortDate(data.eta)+'</p>';",
  "if(data.slot)html+='<p>'+shortDate(data.slot.start)+', '+windowShort(data.slot.start,data.slot.end)+'</p><p>'+(data.slot.provider||'')+'</p>';",
  "html+=data.overCap?'<p class=\"warn\">Over your '+money(data.capUsd,false)+' limit by '+money(data.overByUsd,true)+'</p><p>Say \\'approve\\' and your code</p>':'<p>Within your '+money(data.capUsd,false)+' limit</p><p>Say your purchase code</p>';",
  "html+='<p class=\"row\"><button type=\"button\" id=\"voice\">Confirm by voice</button><button type=\"button\" id=\"cancel\">Cancel</button></p>';",
  "main.innerHTML=html;main.querySelector('#voice').addEventListener('click',function(){postIntent('Confirm by voice');});main.querySelector('#cancel').addEventListener('click',function(){postIntent('Cancel');});}",
].join("");

const RECEIPT_RENDER = [
  "function render(data,context){const kind=data.kind==='booking'?'booking':'order';const id=data.orderId||data.bookingId||data.id||'';const steps=kind==='booking'?['Booked']:['Placed','Shipped','Delivered'];const active=sentence(data.status||(kind==='booking'?'booked':'placed'));",
  "let html='<p>'+id+'</p><div class=\"steps\">';steps.forEach(function(step){html+='<span class=\"step'+(step.toLowerCase()===active.toLowerCase()?' active':'')+'\">'+step+'</span>';});html+='</div><ul>';",
  "const lines=(context&&context.lines)||data.lines||[];lines.forEach(function(line){html+='<li>'+(line.name||line.provider||'Line')+'</li>';});html+='</ul>';",
  "if(context&&context.totalUsd)html+='<p>Total '+money(context.totalUsd,true)+'</p>';",
  "if(data.eta)html+='<p>'+shortDate(data.eta)+'</p>';",
  "if(data.slot)html+='<p>'+shortDate(data.slot.start)+', '+windowShort(data.slot.start,data.slot.end)+'</p>';",
  "html+='<p>Mock order, no real purchase or payment</p>';main.innerHTML=html;}",
].join("");

const TASK_RENDER = [
  "function render(data,context){const task=data.task||{};const title=(context&&context.title)||task.title||'Task';const due=task.dueDate||data.nextDue||'';const appliance=(context&&context.applianceName)||'';const onHand=context&&context.onHand;const done=context&&context.done===true||task.status==='closed'||!!data.lastDone;",
  "let html='<h2>'+title+'</h2>';if(due)html+='<p>'+shortDate(due)+'</p>';if(appliance)html+='<p>'+sentence(appliance)+'</p>';",
  "if(onHand)html+='<p>'+onHand.name+' x'+onHand.qty+', '+(onHand.location||'')+'</p>';",
  "const after=data.inventoryAfter;if(after)html+='<p>'+after.name+' x'+after.qty+', '+after.location+'</p>';",
  "if(done){html+='<p class=\"warn\">Done</p>';}else{html+='<button type=\"button\" id=\"done\">Mark done</button>';}",
  "main.innerHTML=html;const button=main.querySelector('#done');if(button)button.addEventListener('click',function(){postIntent('Done, I swapped it');});}",
].join("");

export function statusCardHtml(): string {
  return documentFor("Upkeep status", "status", STATUS_RENDER);
}

export function optionsCardHtml(): string {
  return documentFor("Options", "options", OPTIONS_RENDER);
}

export function checkoutCardHtml(): string {
  return documentFor("Checkout", "checkout", CHECKOUT_RENDER);
}

export function receiptCardHtml(): string {
  return documentFor("Receipt", "receipt", RECEIPT_RENDER);
}

export function taskCardHtml(): string {
  return documentFor("Task", "task", TASK_RENDER);
}
