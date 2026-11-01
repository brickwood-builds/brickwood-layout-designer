// Read-only viewer (Phase 7C, FR-12.06): one self-contained web page of a layout that anyone
// can open in a browser — pan, zoom, find a module, read details — but never change. Share it
// through OneDrive (specific people, or anyone with the link) and revoke the link there.
import { STANDALONE_STYLE, overheadSvg } from './overheadSvg';
import { allItems, isModule } from '../domain/edits';
import { isBase, moduleDisplayName, type Project } from '../domain/schema';
import { formatLength } from '../domain/units';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const STYLE = `
*{box-sizing:border-box}
body{margin:0;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#1b1b1b;background:#f6f6f4}
header{padding:12px 16px;background:#fff;border-bottom:1px solid #ddd}
h1{font-size:20px;margin:0}
.muted{color:#666;font-size:13px}
.bar{display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:8px 16px}
button,input{font:inherit;min-height:36px;padding:0 12px;border:1px solid #bbb;border-radius:8px;background:#fff}
button[aria-pressed=true]{background:#1f6feb;color:#fff;border-color:#1f6feb}
input{flex:1 1 200px;max-width:320px}
.plan{margin:0 16px;background:#fff;border:1px solid #ddd;border-radius:10px;height:62vh;overflow:hidden;touch-action:none;position:relative}
.plan svg{width:100%;height:100%;display:block;cursor:grab}
.level{display:none}.level.on{display:block;height:100%}
.pv-thing.hit rect,.pv-thing.hit ellipse{stroke:#d1242f;stroke-width:1.2}
.tip{position:absolute;left:8px;bottom:8px;right:8px;background:rgba(255,255,255,.95);border:1px solid #ccc;border-radius:8px;padding:6px 10px;font-size:14px;display:none}
section{margin:16px;background:#fff;border:1px solid #ddd;border-radius:10px;padding:8px 14px}
h2{font-size:16px;margin:6px 0}
table{border-collapse:collapse;width:100%;font-size:13px}
th,td{border-bottom:1px solid #eee;padding:4px 6px;text-align:left}
footer{margin:16px;color:#666;font-size:12px}
${STANDALONE_STYLE}`;

const SCRIPT = `
(function(){
  var levels=[].slice.call(document.querySelectorAll('.level'));
  var tip=document.querySelector('.tip');
  function cur(){return document.querySelector('.level.on svg')}
  function vb(s){var v=s.getAttribute('viewBox').split(' ').map(Number);return {x:v[0],y:v[1],w:v[2],h:v[3]}}
  function set(s,v){s.setAttribute('viewBox',[v.x,v.y,v.w,v.h].join(' '))}
  levels.forEach(function(l){var s=l.querySelector('svg');s.dataset.home=s.getAttribute('viewBox')});
  function zoom(f,cx,cy){var s=cur(),v=vb(s),r=s.getBoundingClientRect();
    var px=cx===undefined?.5:(cx-r.left)/r.width,py=cy===undefined?.5:(cy-r.top)/r.height;
    var nw=Math.min(Math.max(v.w*f,4),v.w*20),nh=nw*v.h/v.w;
    set(s,{x:v.x+(v.w-nw)*px,y:v.y+(v.h-nh)*py,w:nw,h:nh})}
  document.getElementById('zin').onclick=function(){zoom(.7)};
  document.getElementById('zout').onclick=function(){zoom(1/.7)};
  document.getElementById('fit').onclick=function(){var s=cur();s.setAttribute('viewBox',s.dataset.home)};
  document.querySelectorAll('[data-level]').forEach(function(b){b.onclick=function(){
    levels.forEach(function(l){l.classList.toggle('on',l.id===b.dataset.level)});
    document.querySelectorAll('[data-level]').forEach(function(x){x.setAttribute('aria-pressed',x===b)})}});
  var plan=document.querySelector('.plan'),pts={},last=null,pinch=null;
  plan.addEventListener('wheel',function(e){e.preventDefault();zoom(Math.exp(e.deltaY*.0015),e.clientX,e.clientY)},{passive:false});
  plan.addEventListener('pointerdown',function(e){pts[e.pointerId]={x:e.clientX,y:e.clientY};plan.setPointerCapture(e.pointerId);last={x:e.clientX,y:e.clientY,moved:false}});
  plan.addEventListener('pointermove',function(e){if(!pts[e.pointerId])return;pts[e.pointerId]={x:e.clientX,y:e.clientY};var ids=Object.keys(pts);
    if(ids.length===2){var a=pts[ids[0]],b=pts[ids[1]],d=Math.hypot(a.x-b.x,a.y-b.y);if(pinch)zoom(pinch/d,(a.x+b.x)/2,(a.y+b.y)/2);pinch=d;return}
    if(!last)return;var s=cur(),v=vb(s),r=s.getBoundingClientRect(),k=Math.max(v.w/r.width,v.h/r.height);
    if(Math.abs(e.clientX-last.x)+Math.abs(e.clientY-last.y)>2)last.moved=true;
    v.x-=(e.clientX-last.x)*k;v.y-=(e.clientY-last.y)*k;set(s,v);last.x=e.clientX;last.y=e.clientY});
  function up(e){delete pts[e.pointerId];if(Object.keys(pts).length<2)pinch=null;
    if(last&&!last.moved){var g=e.target.closest&&e.target.closest('.pv-thing');var t=g&&g.querySelector('title');
      tip.style.display=t?'block':'none';if(t)tip.textContent=t.textContent}
    if(!Object.keys(pts).length)last=null}
  plan.addEventListener('pointerup',up);plan.addEventListener('pointercancel',up);
  document.getElementById('find').oninput=function(e){var q=e.target.value.trim().toLowerCase();var hit=null;
    document.querySelectorAll('.pv-thing').forEach(function(g){var on=!!q&&g.dataset.find.indexOf(q)>=0;g.classList.toggle('hit',on);
      if(on&&!hit&&g.closest('.level.on'))hit=g});
    if(hit){var b=hit.getBBox(),s=cur(),v=vb(s),w=Math.max(b.width*6,40),h=w*v.h/v.w;set(s,{x:b.x+b.width/2-w/2,y:b.y+b.height/2-h/2,w:w,h:h});
      tip.style.display='block';tip.textContent=hit.querySelector('title').textContent}}
})();`;

/** A complete, self-contained read-only page for a layout. */
export function viewerHtml(p: Project, now = new Date()): string {
  const levels = [...p.levels].sort((a, b) => a.order - b.order).filter((l) => l.visible);
  const unit = p.settings.displayUnit === 'studs' ? 'in' : p.settings.displayUnit;
  const plans = levels
    .map((l, i) => `<div class="level${i === 0 ? ' on' : ''}" id="lv${i}">${overheadSvg(p, { levelId: l.id, labels: true, titles: true })}</div>`)
    .join('');
  const levelButtons = levels.length > 1 ? levels.map((l, i) => `<button type="button" data-level="lv${i}" aria-pressed="${i === 0}">${esc(l.name)}</button>`).join('') : '';
  const things = allItems(p).filter((i) => isModule(i) || i.type === 'footprint');
  const rows = things
    .sort((a, b) => (isModule(a) ? moduleDisplayName(a) : a.name).localeCompare(isModule(b) ? moduleDisplayName(b) : b.name, undefined, { numeric: true }))
    .map((i) => {
      const name = isModule(i) ? moduleDisplayName(i) : i.name;
      const kind = isModule(i) ? (isBase(i) ? 'Feature' : `MILS ${i.kind}`) : 'Feature';
      const lvl = p.levels.find((l) => l.id === i.levelId)?.name ?? '';
      return `<tr><td>${esc(name)}</td><td>${esc(isModule(i) && i.label && i.name ? i.name : '')}</td><td>${esc(kind)}</td>${levels.length > 1 ? `<td>${esc(lvl)}</td>` : ''}<td>${esc(formatLength(i.x, unit))}, ${esc(formatLength(i.y, unit))}</td><td>${esc(i.notes)}</td></tr>`;
    })
    .join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(p.name)} — view</title><style>${STYLE}</style></head><body>
<header><h1>${esc(p.name)}</h1><div class="muted">Read-only view · made ${esc(now.toLocaleDateString())} with Brickwood Layout Designer · nothing can be changed here</div></header>
<div class="bar">${levelButtons}<button type="button" id="zin" aria-label="Zoom in">+</button><button type="button" id="zout" aria-label="Zoom out">−</button><button type="button" id="fit">Fit</button><input id="find" type="search" placeholder="Find a module, e.g. B-07 or Carousel" aria-label="Find"></div>
<div class="plan">${plans}<div class="tip" role="status"></div></div>
<section><h2>Modules and features (${things.length})</h2><table><thead><tr><th>ID / name</th><th>Name</th><th>Kind</th>${levels.length > 1 ? '<th>Level</th>' : ''}<th>From left, back</th><th>Notes</th></tr></thead><tbody>${rows}</tbody></table></section>
<footer>Drag to move around, scroll or pinch to zoom, tap something for its details.</footer>
<script>${SCRIPT}</script></body></html>`;
}

export const viewerFileName = (p: Project) => `${p.name.replace(/[^\w -]+/g, '').trim() || 'layout'} - view.html`;
