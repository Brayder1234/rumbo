// Rumbo — interfaz. Pantallas: Hoy, Semana, Sueño, Revisión y Ajustes.
import * as store from './store.js';
import * as M from './model.js';
import * as T from './time.js';
import * as S from './sound.js';
import { propose, applyProposal, addRecurring } from './scheduler.js';
import { parseTask, parseTasks } from './parser.js';

const st = () => store.state;
const $ = (sel) => document.querySelector(sel);
const main = $('#main');
const tabbar = $('#tabbar');
const sheets = $('#sheets');
const overlay = $('#overlay');
const H = 21; // píxeles por hora en la semana

const ui = {
  tab: sessionStorage.getItem('rumbo.tab') || 'hoy',
  mode: 'plan',     // semana: 'plan' (esta semana) o 'tpl' (plantilla)
  week: 0,          // semanas desde la actual
  revWeek: 0,
  sheet: null,
  listening: null,
  alarm: null,
};

// ---------- utilidades ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const todayKey = () => T.dateKey();
const now = () => ({ key: T.dateKey(), min: T.nowMin() });

const ICONS = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  chart: '<path d="M5 20V11M12 20V5M19 20v-6"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  next: '<path d="M9 5l7 7-7 7"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  inbox: '<path d="M3 13l3-8h12l3 8v6H3z"/><path d="M3 13h5l1 3h6l1-3h5"/>',
  speaker: '<path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>',
};
const icon = (n, size) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true"${size ? ` style="width:${size}px;height:${size}px"` : ''}>${ICONS[n]}</svg>`;

const SPECIAL = { _sueno: { name: 'Sueño', color: '#5B6B8C' }, _desc: { name: 'Desconexión', color: '#8A929C' } };
const area = (id) => SPECIAL[id] || st().areas.find((a) => a.id === id) || { id, name: 'Sin área', color: '#8A929C' };
const tint = (color) => `color-mix(in srgb, ${color} 24%, var(--card))`;

function prioBadge(p) {
  if (p === 'fijo') return `<span class="badge fijo">${icon('lock', 12)}Fijo</span>`;
  if (p === 'alta') return '<span class="badge alta">Alta</span>';
  return `<span class="badge">${M.prioName(p)}</span>`;
}

function fullDay(key) {
  const wd = T.weekday(key);
  return [...M.dayBlocks(st(), key), ...M.sleepBlocks(st().settings, wd)].sort((a, b) => a.start - b.start);
}

let toastTimer = null;
function toast(msg, action) {
  const box = $('#toast');
  clearTimeout(toastTimer);
  box.innerHTML = `<div class="msg"><span>${esc(msg)}</span>${action ? `<button type="button" data-act="${action.act}" ${action.data || ''}>${esc(action.label)}</button>` : ''}</div>`;
  toastTimer = setTimeout(() => (box.innerHTML = ''), msg.includes('\n') ? 15000 : action ? 9000 : 3500);
}

function changed() {
  store.save();
  render();
}

// ---------- tema ----------
const mq = window.matchMedia('(prefers-color-scheme: dark)');
const isDark = () => st().settings.theme === 'dark' || (st().settings.theme === 'auto' && mq.matches);
function applyTheme() {
  const dark = isDark();
  document.documentElement.classList.toggle('dark', dark);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#0B0D10' : '#F2F3F5');
}
mq.addEventListener?.('change', () => st().settings.theme === 'auto' && render());

const themeBtn = () => `<button type="button" class="icon-btn" data-act="toggleTheme" aria-label="${isDark() ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}">${icon(isDark() ? 'sun' : 'moon')}</button>`;

// ---------- pantalla: Hoy ----------
function viewHoy() {
  const n = now();
  const s = st();
  const blocks = fullDay(n.key);
  const cur = blocks.find((b) => b.start <= n.min && n.min < b.end);
  const real = M.dayBlocks(s, n.key);
  const next = blocks.filter((b) => b.start > n.min && b !== cur);
  const review = s.settings.askDone ? real.filter((b) => b.end <= n.min && b.done == null && b.priority !== 'flexible').slice(-3) : [];
  const sleepAsk = !s.sleepLog[n.key] && n.min >= M.sleepInfo(s.settings, T.weekday(n.key)).wake && n.min < 14 * 60;

  const bar = blocks.map((b) => `<span title="${esc(b.title)} ${T.fmt(b.start)} – ${T.fmt(b.end)}" style="left:${(b.start / 1440) * 100}%;width:${((b.end - b.start) / 1440) * 100}%;background:${area(b.area).color}"></span>`).join('');
  const slept = s.sleepLog[n.key];

  return `
  <header class="head">
    <div><div class="eyebrow">${esc(T.longDate(n.key))}</div><h1>Hoy</h1></div>
    <div class="head-tools">
      ${themeBtn()}
      <button type="button" class="icon-btn" data-act="tab" data-tab="ajustes" aria-label="Ajustes">${icon('gear')}</button>
      <button type="button" class="icon-btn acc" data-act="newTask" aria-label="Nueva tarea">${icon('plus', 22)}</button>
    </div>
  </header>

  ${sleepAsk ? `
  <section class="card pad" aria-label="Registro de sueño">
    <div class="ai-head">${icon('moon', 16)}<span>¿Cuánto dormiste anoche?</span></div>
    <div class="chips">${[5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9].map((h) => `<button type="button" class="chip" data-act="logSleep" data-h="${h}">${String(h).replace('.', ',')} h</button>`).join('')}</div>
  </section>` : ''}

  <section class="card pad" aria-label="Tu día en 24 horas">
    <div class="section-head"><strong style="font-size:15px">Tu día en 24 h</strong><span class="small muted">${slept ? `Dormiste ${T.dur(slept * 60)}` : `Te acuestas a las ${T.fmt(M.sleepInfo(s.settings, T.weekday(n.key)).bed % 1440)}`}</span></div>
    <div class="bar24">${bar}<span class="now" style="left:${(n.min / 1440) * 100}%"></span></div>
    <div class="bar24-scale"><span>0 h</span><span>6</span><span>12</span><span>18</span><span>24 h</span></div>
  </section>

  ${heroCard(cur, next, n)}

  ${review.length ? `
  <section class="section">
    <h2>¿Lo cumpliste?</h2>
    <div class="card">${review.map((b) => `
      <div class="row">
        <span class="dot" style="background:${area(b.area).color}"></span>
        <div class="grow"><span class="t">${esc(b.title)}</span><span class="s">${T.fmt(b.start)} – ${T.fmt(b.end)}</span></div>
        <button type="button" class="btn small soft" data-act="markDone" data-key="${n.key}" data-id="${b.id}" data-v="1">Sí</button>
        <button type="button" class="btn small" data-act="markDone" data-key="${n.key}" data-id="${b.id}" data-v="0">No</button>
      </div>`).join('')}
    </div>
  </section>` : ''}

  <section class="section">
    <div class="section-head"><h2>Pendientes</h2><button type="button" class="link-btn" data-act="newTask">Agregar</button></div>
    <div class="card">
      ${s.tasks.length ? s.tasks.map((t) => `
      <div class="row">
        <span class="dot" style="background:${area(t.area).color}"></span>
        <div class="grow"><span class="t">${esc(t.title)}</span><span class="s">${T.dur(t.duration)}${t.due ? ` · para ${T.relDay(t.due, n.key)}` : ''}</span></div>
        ${prioBadge(t.priority)}
        <button type="button" class="btn small soft" data-act="scheduleTask" data-id="${t.id}">Agendar</button>
        <button type="button" class="icon-btn" style="background:transparent" data-act="deleteTask" data-id="${t.id}" aria-label="Borrar ${esc(t.title)}">${icon('trash', 18)}</button>
      </div>`).join('') : '<p class="empty">Lo que te surja, díselo al micrófono y tu secretaria le busca lugar.</p>'}
    </div>
  </section>

  <section class="section">
    <h2>Lo que sigue</h2>
    <div class="card">
      ${next.length ? next.map((b) => blockRow(b, n.key)).join('') : '<p class="empty">No queda nada más por hoy.</p>'}
    </div>
  </section>`;
}

function blockRow(b, key) {
  const a = area(b.area);
  const sub = b.auto ? (b.area === '_sueno' ? 'Tu sueño' : 'Sin pantallas') : `${a.name} · ${T.dur(b.end - b.start)}${b.source === 'secretaria' ? ' · lo agendó tu secretaria' : ''}`;
  const inner = `
    <span class="time">${T.fmt(b.start)}</span>
    <span class="dot" style="background:${a.color}"></span>
    <span class="grow"><span class="t">${esc(b.title)}</span><span class="s">${esc(sub)}</span></span>
    ${prioBadge(b.priority)}`;
  if (b.auto) return `<div class="row">${inner}</div>`;
  return `<button type="button" class="row button" data-act="editBlock" data-key="${key}" data-id="${b.id}">${inner}</button>`;
}

function heroCard(cur, next, n) {
  const s = st();
  const upcoming = next.find((b) => !b.auto) || next[0];
  if (!cur) {
    const until = upcoming ? upcoming.start : M.awakeWindow(s.settings, T.weekday(n.key))[1];
    return `
    <section class="hero" aria-label="Ahora">
      <div class="meta"><span>Ahora · hasta las ${T.fmt(until)}</span><span>Tiempo libre</span></div>
      <div class="title">Tienes ${T.dur(until - n.min)} libres</div>
      <div class="sub">${upcoming ? `Después: ${esc(upcoming.title)}` : 'Úsalo para lo que tengas pendiente o para descansar.'}</div>
      <div class="foot"><span></span><button type="button" class="hbtn" data-act="newTask">Agregar algo</button></div>
    </section>`;
  }
  const pct = Math.min(100, Math.max(0, ((n.min - cur.start) / (cur.end - cur.start)) * 100));
  const done = cur.done === true;
  const left = cur.end - n.min;
  const isSleep = cur.area === '_sueno';
  return `
  <section class="hero" aria-label="Ahora">
    <div class="meta"><span>Ahora · ${T.fmt(cur.start)} – ${T.fmt(cur.end)}</span><span>${cur.auto ? '' : `Prioridad ${M.prioName(cur.priority).toLowerCase()}`}</span></div>
    <div class="title">${esc(isSleep ? 'Hora de dormir' : cur.title)}</div>
    <div class="sub">${esc(isSleep ? `Te levantas a las ${T.fmt(M.sleepInfo(s.settings, T.weekday(n.key)).wake)}` : area(cur.area).name)}</div>
    <div class="track"><span style="width:${done ? 100 : pct}%"></span></div>
    <div class="foot">
      <span class="small" style="color:var(--herosub)">${done ? 'Bloque cumplido' : `Quedan ${T.dur(left)}`}</span>
      ${cur.auto ? '' : `<span style="display:flex;gap:8px">
        <button type="button" class="hbtn ghost" data-act="moveBlock" data-key="${n.key}" data-id="${cur.id}">Mover</button>
        <button type="button" class="hbtn" data-act="markDone" data-key="${n.key}" data-id="${cur.id}" data-v="${done ? '' : '1'}">${done ? 'Deshacer' : 'Marcar cumplido'}</button>
      </span>`}
    </div>
  </section>`;
}

// ---------- pantalla: Semana ----------
function viewSemana() {
  const s = st();
  const tpl = ui.mode === 'tpl';
  const t0 = T.addDays(T.weekStart(todayKey()), ui.week * 7);
  const n = now();
  const days = [];
  for (let i = 0; i < 7; i++) {
    const key = T.addDays(t0, i);
    const list = tpl ? (s.template[i] || []) : M.dayBlocks(s, key);
    days.push({ i, key, list, all: [...list, ...M.sleepBlocks(s.settings, i)] });
  }
  const end = T.addDays(t0, 6);
  const range = tpl ? 'Tu semana tipo' : `${T.fromKey(t0).getDate()} – ${T.fromKey(end).getDate()} de ${T.MONTHS[T.fromKey(end).getMonth()]}`;

  // Totales por área
  const tot = {};
  for (const d of days) for (const b of d.all) tot[b.area] = (tot[b.area] || 0) + (b.end - b.start);
  const used = Object.values(tot).reduce((a, b) => a + b, 0);
  const tiles = Object.entries(tot).sort((a, b) => b[1] - a[1]).map(([id, m]) => ({ name: area(id).name, color: area(id).color, m }));
  tiles.push({ name: 'Sin asignar', color: 'var(--off)', m: Math.max(0, 7 * 1440 - used) });

  const cols = days.map((d) => `
    <div class="col" data-act="colClick" data-key="${d.key}" data-wd="${d.i}" style="height:${24 * H}px" aria-label="${T.DAYS[d.i]}">
      ${d.all.map((b) => {
        const a = area(b.area);
        const label = b.end - b.start >= 50 ? esc(b.title) : '';
        const style = `top:${(b.start / 60) * H}px;height:${Math.max(3, ((b.end - b.start) / 60) * H - 1)}px;background:${tint(a.color)};color:var(--ink)${b.done === true ? ';opacity:.55' : ''}`;
        if (b.auto) return `<div class="blk auto" style="${style}" title="${esc(b.title)}">${label}</div>`;
        return `<button type="button" class="blk" data-act="editBlock" data-key="${tpl ? '' : d.key}" data-wd="${d.i}" data-id="${b.id}" style="${style}" title="${esc(b.title)} ${T.fmt(b.start)} – ${T.fmt(b.end)}" aria-label="${esc(b.title)}, ${T.fmt(b.start)} a ${T.fmt(b.end)}">${label}</button>`;
      }).join('')}
      ${!tpl && d.key === n.key ? `<span class="nowline" style="top:${(n.min / 60) * H}px"></span>` : ''}
    </div>`).join('');

  const usedAreas = [...new Set(days.flatMap((d) => d.all.map((b) => b.area)))];

  return `
  <header class="head">
    <div><div class="eyebrow">${esc(range)}</div><h1>Semana</h1></div>
    <div class="head-tools">${themeBtn()}</div>
  </header>

  <div class="seg" role="group" aria-label="Qué semana ver">
    <button type="button" data-act="weekMode" data-mode="plan" aria-pressed="${!tpl}">Esta semana</button>
    <button type="button" data-act="weekMode" data-mode="tpl" aria-pressed="${tpl}">Plantilla</button>
  </div>

  ${tpl ? '<p class="hint">La plantilla es tu semana normal. Rumbo la copia a cada semana nueva. Toca un espacio vacío para agregar un bloque, o un bloque para cambiarlo. Toca el nombre de un día para copiarlo a otros días.</p>' : `
  <div class="weeknav">
    <button type="button" class="icon-btn" data-act="weekNav" data-d="-1" aria-label="Semana anterior">${icon('back')}</button>
    ${ui.week ? '<button type="button" class="link-btn" data-act="weekNav" data-d="0">Volver a esta semana</button>' : '<span class="small muted">Toca un espacio vacío para agregar</span>'}
    <button type="button" class="icon-btn" data-act="weekNav" data-d="1" aria-label="Semana siguiente">${icon('next')}</button>
  </div>`}

  <section class="week" aria-label="Semana de 24 horas">
    <div class="week-head">
      ${days.map((d) => `<button type="button" class="${!tpl && d.key === n.key ? 'today' : ''}" data-act="dayMenu" data-key="${d.key}" data-wd="${d.i}" aria-label="Opciones del ${T.DAYS[d.i]}"><span class="wd">${T.DAYS_SHORT[d.i]}</span><span class="dn">${tpl ? T.DAYS_LETTER[d.i] : T.fromKey(d.key).getDate()}</span></button>`).join('')}
    </div>
    <div class="week-body">
      <div class="hours" style="height:${24 * H}px" aria-hidden="true">
        <span style="top:0">0</span><span style="top:${6 * H}px">6</span><span style="top:${12 * H}px">12</span><span style="top:${18 * H}px">18</span><span style="top:${24 * H}px">24</span>
      </div>
      ${cols}
    </div>
    <div class="legend">${usedAreas.map((id) => `<span><i style="background:${area(id).color}"></i>${esc(area(id).name)}</span>`).join('')}</div>
  </section>

  <section class="section">
    <h2>Tus 168 horas</h2>
    <div class="tiles">${tiles.map((t) => `<div class="tile"><span class="k"><span class="dot" style="width:8px;height:8px;background:${t.color}"></span>${esc(t.name)}</span><span class="v">${String(Math.round(t.m / 6) / 10).replace('.', ',')} h</span></div>`).join('')}</div>
  </section>`;
}

// ---------- pantalla: Sueño ----------
function sleepNights(endKey) {
  const out = [];
  for (let i = 6; i >= 0; i--) {
    const key = T.addDays(endKey, -i);
    out.push({ key, h: st().sleepLog[key] ?? null });
  }
  return out;
}

function viewSueno() {
  const s = st().settings;
  const wk = M.sleepInfo(s, 0);
  const we = M.sleepInfo(s, 5);
  const nights = sleepNights(todayKey());
  const logged = nights.filter((x) => x.h != null);
  const goal = s.sleepGoal / 60;
  const min = s.sleepMin / 60;
  const avg = logged.length ? logged.reduce((a, x) => a + x.h, 0) / logged.length : null;
  const debt = logged.reduce((a, x) => a + Math.max(0, goal - x.h), 0);
  const scale = 110 / 10;
  const opts = (from, to, step, val) => {
    let o = '';
    for (let m = from; m <= to; m += step) o += `<option value="${m}" ${m === val ? 'selected' : ''}>${T.dur(m)}</option>`;
    return o;
  };

  return `
  <header class="head">
    <div><div class="eyebrow">Tu descanso</div><h1>Sueño</h1></div>
    <div class="head-tools">${themeBtn()}</div>
  </header>

  <section class="card" aria-label="Tu horario de sueño">
    <div class="field-row">
      <label class="field"><span>Te levantas L–V</span><input type="time" data-set="wake" value="${T.fmtInput(s.wake)}"></label>
      <label class="field"><span>Sáb y dom</span><input type="time" data-set="wakeWeekend" value="${T.fmtInput(s.wakeWeekend)}"></label>
    </div>
    <div class="field-row" style="border-top:1px solid var(--line)">
      <label class="field"><span>Meta de sueño</span><select data-set="sleepGoal">${opts(360, 600, 15, s.sleepGoal)}</select></label>
      <label class="field"><span>Mínimo intocable</span><select data-set="sleepMin">${opts(300, 540, 15, s.sleepMin)}</select></label>
    </div>
    <label class="field" style="border-top:1px solid var(--line)"><span>Desconexión antes de dormir</span><select data-set="windDown">${opts(15, 90, 15, s.windDown)}</select></label>
    <div class="row" style="background:var(--accsoft);border-bottom:0">
      <span class="grow"><span class="t">Te acuestas</span><span class="s">Calculado con tu meta</span></span>
      <span class="num" style="font-size:20px;font-weight:700;color:var(--acctext)">${T.fmt(wk.bed % 1440)}</span>
      <span class="small muted">sáb y dom ${T.fmt(we.bed % 1440)}</span>
    </div>
  </section>

  <section class="card pad" aria-label="Últimas 7 noches">
    <div class="section-head"><strong style="font-size:15px">Últimas 7 noches</strong><span class="small muted">Línea = meta</span></div>
    ${logged.length ? `
    <div class="chart">
      ${nights.map((x) => `<div class="c"><b>${x.h != null ? String(x.h).replace('.', ',') : '–'}</b><i style="height:${x.h != null ? Math.round(x.h * scale) : 2}px;background:${x.h == null ? 'var(--line)' : x.h >= goal ? 'var(--acc)' : x.h >= min ? '#8A9BB8' : '#E5484D'}"></i></div>`).join('')}
      <span class="goal" style="bottom:${Math.round(goal * scale)}px"></span>
    </div>
    <div class="chart-x">${nights.map((x) => `<span>${T.DAYS_SHORT[T.weekday(x.key)].slice(0, 3).toLowerCase()}</span>`).join('')}</div>
    <div class="tiles" style="grid-template-columns:repeat(2,minmax(0,1fr))">
      <div class="tile" style="background:var(--soft)"><span class="k">Promedio</span><span class="v">${T.dur(avg * 60)}</span></div>
      <div class="tile" style="background:var(--alta-bg)"><span class="k" style="color:var(--alta-fg)">Deuda de sueño</span><span class="v" style="color:var(--alta-fg)">${T.dur(debt * 60)}</span></div>
    </div>` : '<p class="empty">Cada mañana Rumbo te pregunta cuánto dormiste. Aquí verás tus noches.</p>'}
    <div class="row" style="padding:4px 0 0;border:0;min-height:0">
      <label class="grow"><span class="s">Registrar otra noche</span>
        <span style="display:flex;gap:8px;align-items:center">
          <select id="sleepDay" class="inline-select">${nights.slice().reverse().map((x) => `<option value="${x.key}">${esc(T.relDay(x.key, todayKey()) === 'hoy' ? 'Anoche' : `Noche antes del ${T.DAYS[T.weekday(x.key)].toLowerCase()}`)}</option>`).join('')}</select>
          <select id="sleepHours" class="inline-select">${[4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10].map((h) => `<option value="${h}" ${h === 7 ? 'selected' : ''}>${String(h).replace('.', ',')} h</option>`).join('')}</select>
          <button type="button" class="btn small soft" data-act="logSleepForm">Guardar</button>
        </span>
      </label>
    </div>
  </section>

  <section class="section">
    <h2>Reglas para tu secretaria</h2>
    <div class="card">
      <div class="row"><span style="color:var(--acctext)">${icon('check')}</span><span class="grow"><span>Nunca agenda nada en tu sueño ni en la desconexión.</span></span></div>
      <div class="row"><span style="color:var(--acctext)">${icon('check')}</span><span class="grow"><span>Tu hora de levantarte es fija: la de acostarte se calcula con tu meta.</span></span></div>
      <div class="row"><span style="color:var(--acctext)">${icon('check')}</span><span class="grow"><span>A la hora de desconectarte suena un aviso.</span></span></div>
    </div>
  </section>`;
}

// ---------- pantalla: Revisión ----------
function weekStats(startKey) {
  const s = st();
  const n = now();
  const per = {};
  let done = 0;
  let total = 0;
  let unmarked = 0;
  for (let i = 0; i < 7; i++) {
    const key = T.addDays(startKey, i);
    if (key > n.key) break;
    if (s.since && key < s.since) continue; // antes de empezar a usar Rumbo no cuenta
    for (const b of M.dayBlocks(s, key)) {
      if (key === n.key && b.end > n.min) continue;
      if (b.priority === 'flexible') continue;
      const a = (per[b.area] = per[b.area] || { done: 0, total: 0, min: 0 });
      a.total++;
      a.min += b.end - b.start;
      total++;
      if (b.done === true) {
        a.done++;
        done++;
      } else if (b.done == null) unmarked++;
    }
  }
  return { per, done, total, unmarked };
}

function viewRevision() {
  const start = T.addDays(T.weekStart(todayKey()), -7 * ui.revWeek);
  const end = T.addDays(start, 6);
  const w = weekStats(start);
  const prev = weekStats(T.addDays(start, -7));
  const pct = w.total ? Math.round((w.done / w.total) * 100) : null;
  const ppct = prev.total ? Math.round((prev.done / prev.total) * 100) : null;
  const nights = [];
  for (let i = 0; i < 7; i++) nights.push(st().sleepLog[T.addDays(start, i)]);
  const inGoal = nights.filter((h) => h != null && h * 60 >= st().settings.sleepGoal).length;
  const logged = nights.filter((h) => h != null).length;
  const rows = Object.entries(w.per).sort((a, b) => b[1].total - a[1].total);
  const weakest = rows.filter(([, a]) => a.total >= 2).sort((a, b) => a[1].done / a[1].total - b[1].done / b[1].total)[0];

  return `
  <header class="head">
    <div><div class="eyebrow">${T.fromKey(start).getDate()} ${T.MONTHS[T.fromKey(start).getMonth()].slice(0, 3)} – ${T.fromKey(end).getDate()} ${T.MONTHS[T.fromKey(end).getMonth()].slice(0, 3)}</div><h1>Revisión</h1></div>
    <div class="head-tools">${themeBtn()}</div>
  </header>

  <div class="seg" role="group" aria-label="Qué semana revisar">
    <button type="button" data-act="revWeek" data-w="0" aria-pressed="${ui.revWeek === 0}">Esta semana</button>
    <button type="button" data-act="revWeek" data-w="1" aria-pressed="${ui.revWeek === 1}">Semana pasada</button>
  </div>

  <section class="hero">
    <span class="small" style="color:var(--herosub)">Bloques cumplidos</span>
    <span class="num" style="font-size:48px;line-height:54px;font-weight:700;letter-spacing:-0.02em">${pct == null ? '—' : `${pct} %`}</span>
    <span class="sub">${w.total ? `${w.done} de ${w.total} bloques que ya pasaron${w.unmarked ? ` (${w.unmarked} sin marcar)` : ''}.` : 'Todavía no hay bloques terminados esta semana.'}${ppct != null && ui.revWeek === 0 ? ` La semana pasada: ${ppct} %.` : ''}</span>
  </section>

  ${w.total ? `
  <section class="card pad">
    <div class="ai-head">${icon('spark', 16)}<span>Lo que ve tu secretaria</span></div>
    <p class="ai-text">${pct >= 80 ? 'Buena semana: cumpliste casi todo lo que planeaste.' : pct >= 50 ? 'Vas a medias: más de la mitad de lo planeado se cumplió.' : 'Esta semana se cayeron muchos bloques: quizá la plantilla tiene más de lo que alcanzas a hacer.'}
    ${weakest ? ` Lo que más se cae es ${esc(area(weakest[0]).name)} (${weakest[1].done} de ${weakest[1].total}). Prueba moverlo a una hora en la que tengas más energía.` : ''}
    ${logged ? ` Dormiste en tu meta ${inGoal} de ${logged} noches registradas.` : ''}</p>
    <p class="hint" style="margin:0">En la Fase 2 la IA te propondrá los cambios y los aplicará con un toque.</p>
  </section>` : ''}

  <section class="section">
    <h2>Por área</h2>
    <div class="card pad" style="gap:4px">
      ${rows.length ? rows.map(([id, a]) => `
        <div style="display:flex;flex-direction:column;gap:6px;padding:8px 0">
          <div class="section-head"><span style="display:inline-flex;align-items:center;gap:8px;font-weight:600"><span class="dot" style="background:${area(id).color}"></span>${esc(area(id).name)}</span><span class="small muted num">${a.done} de ${a.total} · ${T.dur(a.min)}</span></div>
          <div class="meter"><span style="width:${a.total ? Math.round((a.done / a.total) * 100) : 0}%;background:${area(id).color}"></span></div>
        </div>`).join('') : '<p class="empty">Cuando pasen tus primeros bloques, aquí verás cómo te fue en cada área.</p>'}
    </div>
  </section>

  <section class="section">
    <h2>Lo que hizo tu secretaria</h2>
    <div class="card">
      <div class="row"><span class="grow"><span>Tareas agendadas</span></span><strong class="num">${st().stats.scheduled || 0}</strong></div>
      <div class="row"><span class="grow"><span>Bloques movidos con tu permiso</span></span><strong class="num">${st().stats.moved || 0}</strong></div>
      <div class="row"><span class="grow"><span>Pendientes sin lugar</span></span><strong class="num">${st().tasks.length}</strong></div>
    </div>
  </section>

  <button type="button" class="btn primary block" data-act="planNext">Armar la próxima semana</button>`;
}

// ---------- pantalla: Ajustes ----------
function viewAjustes() {
  const s = st().settings;
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  const sw = (key, label, sub) => `
    <div class="row">
      <span class="grow"><span>${label}</span>${sub ? `<span class="s">${sub}</span>` : ''}</span>
      <button type="button" class="switch" role="switch" aria-checked="${!!s[key]}" aria-label="${esc(label)}" data-act="toggleSetting" data-key="${key}"></button>
    </div>`;
  return `
  <header class="head">
    <div><button type="button" class="link-btn" data-act="tab" data-tab="hoy" style="display:inline-flex;align-items:center;gap:2px">${icon('back')}Hoy</button><h1>Ajustes</h1></div>
  </header>

  <section class="section">
    <p class="label">Apariencia</p>
    <div class="seg" role="group" aria-label="Apariencia">
      ${[['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Oscuro']].map(([v, l]) => `<button type="button" data-act="setTheme" data-v="${v}" aria-pressed="${s.theme === v}">${l}</button>`).join('')}
    </div>
    <p class="hint">Automático sigue el modo de tu iPhone o tu Mac.</p>
  </section>

  <section class="section">
    <p class="label">Secretaria</p>
    <div class="card">
      ${sw('autoAdd', 'Agregar sin confirmar lo que dicto', 'Al terminar de hablar se agenda sola y te avisa qué hizo. Si algo queda mal, tócalo y lo cambias, o usa Deshacer.')}
    </div>
  </section>

  <section class="section">
    <p class="label">Alarmas</p>
    <div class="card">
      ${sw('alarms', 'Sonar al empezar cada bloque', 'Fijo y Alta: alarma que suena hasta que respondas. Media: un aviso con sonido. Baja y Flexible: sin sonido.')}
      <div class="row"><span class="grow"><span>Avisarme antes</span></span>
        <select class="inline-select" data-set="notifyBefore">${[0, 5, 10, 15, 30].map((m) => `<option value="${m}" ${m === s.notifyBefore ? 'selected' : ''}>${m ? `${m} min antes` : 'No'}</option>`).join('')}</select>
      </div>
      ${sw('askDone', 'Preguntar si lo cumpliste', 'Al terminar cada bloque')}
      <div class="row">
        <span class="grow"><span>Notificaciones del sistema</span><span class="s">${perm === 'granted' ? 'Activadas' : perm === 'denied' ? 'Bloqueadas: actívalas en los ajustes del navegador' : perm === 'unsupported' ? 'En el iPhone primero agrega Rumbo a la pantalla de inicio' : 'Para avisarte aunque estés en otra app'}</span></span>
        ${perm === 'default' ? '<button type="button" class="btn small soft" data-act="askNotify">Activar</button>' : ''}
      </div>
      <div class="row"><span class="grow"><span>Probar la alarma</span><span class="s">Suena en 5 segundos</span></span><button type="button" class="btn small soft" data-act="testAlarm">Probar</button></div>
    </div>
  </section>

  <section class="section">
    <p class="label">Tono de alarma</p>
    <div class="card">
      ${S.TONES.map((t) => `
      <div class="row">
        <button type="button" class="grow" data-act="setTone" data-v="${t.id}" aria-pressed="${s.tone === t.id}" style="border:0;background:transparent;text-align:left;padding:0;display:flex;flex-direction:row;align-items:center;gap:12px;min-height:44px">
          <span style="width:22px;height:22px;border-radius:11px;border:2px solid ${s.tone === t.id ? 'var(--acc)' : 'var(--sub)'};display:flex;align-items:center;justify-content:center;flex-shrink:0"><span style="width:10px;height:10px;border-radius:5px;background:${s.tone === t.id ? 'var(--acc)' : 'transparent'}"></span></span>
          <span style="display:flex;flex-direction:column;gap:2px"><span>${t.name}</span><span class="s">${t.desc}</span></span>
        </button>
        <button type="button" class="btn small soft" data-act="playTone" data-v="${t.id}" aria-label="Probar ${t.name}">Probar</button>
      </div>`).join('')}
    </div>
  </section>

  <section class="section">
    <p class="label">Áreas</p>
    <div class="card">
      ${st().areas.map((a) => `
      <div class="row">
        <label class="sr" for="area-${a.id}">Nombre del área</label>
        <input type="color" value="${a.color}" data-area-color="${a.id}" aria-label="Color de ${esc(a.name)}" style="width:32px;height:32px;border:0;padding:0;background:transparent;flex-shrink:0">
        <input id="area-${a.id}" type="text" value="${esc(a.name)}" data-area-name="${a.id}" style="flex:1;min-width:0;border:0;background:transparent;font-size:16px;min-height:40px">
        <button type="button" class="icon-btn" style="background:transparent" data-act="deleteArea" data-id="${a.id}" aria-label="Borrar ${esc(a.name)}">${icon('trash', 18)}</button>
      </div>`).join('')}
      <button type="button" class="row button" data-act="addArea"><span style="color:var(--acctext)">${icon('plus')}</span><span class="grow"><span style="color:var(--acctext);font-weight:600">Agregar área</span></span></button>
    </div>
  </section>

  <section class="section">
    <p class="label">Instalar</p>
    <div class="card pad">
      <p class="ai-text"><strong>iPhone:</strong> abre Rumbo en Safari, toca Compartir y luego "Agregar a inicio". Después activa las notificaciones aquí.</p>
      <p class="ai-text"><strong>Mac:</strong> en Chrome, menú › Transmitir, guardar y compartir › Instalar página como app. En Safari: Archivo › Agregar al Dock.</p>
      <p class="hint" style="margin:0">En esta Fase 1 las alarmas suenan cuando Rumbo está abierto (aunque esté detrás de otras ventanas en la Mac). Con la app cerrada te avisará Telegram en la Fase 2.</p>
    </div>
  </section>

  <section class="section">
    <p class="label">Tus datos</p>
    <div class="card">
      <button type="button" class="row button" data-act="exportData"><span class="grow"><span class="t" style="font-weight:400">Descargar respaldo</span><span class="s">Un archivo con toda tu agenda</span></span></button>
      <label class="row button" style="cursor:pointer"><span class="grow"><span class="t" style="font-weight:400">Restaurar respaldo</span><span class="s">Reemplaza lo que hay en este dispositivo</span></span><input type="file" accept="application/json,.json" data-import class="sr"></label>
      <button type="button" class="row button" data-act="loadExample"><span class="grow"><span class="t" style="font-weight:400">Cargar la semana de ejemplo</span><span class="s">Reemplaza tu plantilla</span></span></button>
      <button type="button" class="row button" data-act="resetAll"><span class="grow"><span class="t" style="font-weight:400;color:var(--alta-fg)">Borrar todo</span><span class="s">Se guarda una copia de respaldo antes</span></span></button>
    </div>
    <p class="hint">Tus datos viven solo en este dispositivo. En la Fase 2 se sincronizan entre tu iPhone y tu Mac.</p>
  </section>`;
}

// ---------- barra inferior ----------
function renderTabbar() {
  const t = (id, label, ic) => `<button type="button" class="tab" data-act="tab" data-tab="${id}" ${ui.tab === id ? 'aria-current="page"' : ''}>${icon(ic)}<span>${label}</span></button>`;
  tabbar.innerHTML = `<div class="in">
    ${t('hoy', 'Hoy', 'sun')}
    ${t('semana', 'Semana', 'cal')}
    <button type="button" class="mic" data-act="listen" aria-label="Hablar con tu secretaria">${icon('mic')}</button>
    ${t('sueno', 'Sueño', 'moon')}
    ${t('revision', 'Revisión', 'chart')}
  </div>`;
}

const VIEWS = { hoy: viewHoy, semana: viewSemana, sueno: viewSueno, revision: viewRevision, ajustes: viewAjustes };

function render() {
  applyTheme();
  if (!VIEWS[ui.tab]) ui.tab = 'hoy';
  main.innerHTML = VIEWS[ui.tab]();
  renderTabbar();
}

// ---------- hojas ----------
function openSheet(sheet) {
  ui.sheet = sheet;
  renderSheet();
}
function closeSheet() {
  ui.sheet = null;
  sheets.innerHTML = '';
}
function renderSheet() {
  if (!ui.sheet) {
    sheets.innerHTML = '';
    return;
  }
  const html = SHEETS[ui.sheet.type](ui.sheet);
  sheets.innerHTML = `<div class="scrim" data-act="${ui.sheet.locked ? '' : 'closeSheet'}"></div><div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
  const tf = sheets.querySelector('form[data-form="task"]');
  if (tf && ui.sheet.text) refreshMulti(tf);
  const first = sheets.querySelector('[autofocus]');
  if (first) setTimeout(() => first.focus(), 50);
}

const prioPicker = (name, value) => `
  <div class="card">
    ${M.PRIORITIES.map((p) => `
    <label class="row" style="cursor:pointer">
      <input type="radio" name="${name}" value="${p.id}" ${p.id === value ? 'checked' : ''} style="width:22px;height:22px;margin:0;accent-color:var(--acc);flex-shrink:0">
      <span class="grow"><span class="t">${p.name}</span><span class="s">${p.desc}</span></span>
      ${p.id === 'fijo' ? icon('lock', 16) : ''}
    </label>`).join('')}
  </div>`;

const areaOptions = (value) => st().areas.map((a) => `<option value="${a.id}" ${a.id === value ? 'selected' : ''}>${esc(a.name)}</option>`).join('');
const durOptions = (value) => [15, 30, 45, 60, 90, 120, 150, 180, 240, 300].map((m) => `<option value="${m}" ${m === value ? 'selected' : ''}>${T.dur(m)}</option>`).join('') + (![15, 30, 45, 60, 90, 120, 150, 180, 240, 300].includes(value) ? `<option value="${value}" selected>${T.dur(value)}</option>` : '');
function dueOptions(value) {
  const t = todayKey();
  let o = `<option value="" ${!value ? 'selected' : ''}>Cuando haya espacio</option>`;
  for (let i = 0; i < 14; i++) {
    const k = T.addDays(t, i);
    const label = i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : `${T.DAYS[T.weekday(k)]} ${T.fromKey(k).getDate()}`;
    o += `<option value="${k}" ${k === value ? 'selected' : ''}>${label}</option>`;
  }
  return o;
}

const SHEETS = {
  // Nueva tarea: escribe o dicta y Rumbo llena el resto
  nueva(sh) {
    const d = sh.task;
    return `
    <div class="grab"></div>
    <div class="sheet-head"><button type="button" class="link-btn" data-act="closeSheet">Cancelar</button><h2>Nueva tarea</h2><span></span></div>
    <form data-form="task" style="display:flex;flex-direction:column;gap:16px" novalidate>
      <div class="card" style="display:flex;align-items:center;gap:8px;padding-right:8px">
        <label class="field" style="flex:1;border:0"><span>Dímelo como quieras</span>
          <textarea name="texto" rows="2" placeholder="Ir al súper hoy, no hay comida, me toma una hora" ${sh.text ? '' : 'autofocus'}>${esc(sh.text || '')}</textarea>
        </label>
        <button type="button" class="mic" style="margin:0;width:48px;height:48px" data-act="listen" aria-label="Dictar">${icon('mic')}</button>
      </div>
      ${sh.hint ? `<p class="hint">${esc(sh.hint)}</p>` : ''}
      <p class="hint" data-multi style="color:var(--acctext)" hidden></p>
      <div class="section">
        <div class="ai-head" style="margin-left:4px">${icon('spark', 16)}<span>Lo que entendí (puedes cambiarlo)</span></div>
        <div class="card">
          <label class="field"><span>Tarea</span><input name="titulo" value="${esc(d.title)}" placeholder="Qué hay que hacer" required></label>
          <div class="field-row" style="border-bottom:1px solid var(--line)">
            <label class="field"><span>Duración</span><select name="duracion">${durOptions(d.duration)}</select></label>
            <label class="field"><span>Para cuándo</span><select name="fecha">${dueOptions(d.due)}</select></label>
          </div>
          <div class="field-row">
            <label class="field"><span>Hora exacta</span><input type="time" name="hora" value="${d.at != null ? T.fmtInput(d.at) : ''}"></label>
            <label class="field"><span>Área</span><select name="area">${areaOptions(d.area)}</select></label>
          </div>
        </div>
        <p class="hint">Deja la hora vacía para que tu secretaria elija el mejor momento.</p>
      </div>
      <div class="section"><p class="label">Prioridad</p>${prioPicker('prioridad', d.priority)}</div>
      <p class="hint" data-error style="color:var(--alta-fg)" hidden></p>
      <div class="btns">
        <button type="submit" class="btn primary" name="go" value="place">${icon('spark', 18)}<span data-go>Buscarle lugar</span></button>
      </div>
      <button type="submit" class="btn block" name="go" value="inbox">Guardar en pendientes</button>
    </form>`;
  },

  // Propuesta de la secretaria
  propuesta(sh) {
    const p = sh.p;
    const t = todayKey();
    if (!p.ok) {
      return `
      <div class="grab"></div>
      <div class="sheet-head"><span></span><h2>Tu secretaria</h2><span></span></div>
      <div class="card pad"><div class="ai-head">${icon('spark', 16)}<span>No encontré lugar</span></div><p class="ai-text">${esc(p.reason)}</p></div>
      <div class="btns"><button type="button" class="btn primary" data-act="saveInbox">Dejar en pendientes</button><button type="button" class="btn" data-act="backToTask">Cambiar algo</button></div>`;
    }
    const when = (c) => `${T.relDay(c.key, t)} ${T.fmt(c.start)} – ${T.fmt(c.end)}`;
    const line = (c) => {
      if (c.type === 'add') return change('ok', 'plus', 'Agrego', `${c.title} · ${T.dur(c.end - c.start)}`, `${cap(when(c))} · prioridad ${M.prioName(c.priority).toLowerCase()}`);
      if (c.type === 'use') return change('soft', 'inbox', 'Uso tu colchón', c.title, cap(when(c)));
      if (c.type === 'move') return change('warn', 'arrow', 'Muevo', `${c.title} · ${T.dur(c.to.end - c.to.start)}`, `${cap(when(c.from))} → ${when(c.to)}${c.promoted ? ' · sube a Alta' : ''}`);
      if (c.type === 'unplaced') return change('alta', 'inbox', 'Queda en pendientes', `${c.title} · ${T.dur(c.duration)}`, 'No encontré otro hueco esta semana');
      return '';
    };
    const kind = p.kind === 'free' ? (p.late ? 'Lo más pronto sin mover nada (después de la fecha que pediste):' : 'Tienes tiempo libre. Te propongo esto:') : p.kind === 'fixed' ? 'A esa hora tenías otras cosas de menor prioridad. Te propongo esto:' : 'No tienes suficiente tiempo libre seguido, así que hago espacio con cosas de menor prioridad:';
    return `
    <div class="grab"></div>
    <div class="sheet-head"><button type="button" class="link-btn" data-act="backToTask">Atrás</button><h2>Tu secretaria</h2><span></span></div>
    ${p.note ? `<div class="card pad"><p class="ai-text">${esc(p.note)}</p></div>` : ''}
    <p class="ai-text" style="margin:0 4px">${kind}</p>
    <div class="card">
      ${p.changes.map(line).join('')}
      ${change('fijo', 'lock', 'No toco', 'Lo fijo, lo de igual o más prioridad y tu sueño', 'Esas cosas nunca se mueven solas')}
    </div>
    <div class="btns">
      <button type="button" class="btn primary" data-act="confirmProposal">Confirmar</button>
      ${sh.alt ? '<button type="button" class="btn" data-act="altProposal">Otra opción</button>' : ''}
    </div>
    <button type="button" class="btn block" data-act="saveInbox">Mejor la dejo en pendientes</button>`;
  },

  // Crear o editar un bloque (de un día o de la plantilla)
  bloque(sh) {
    const b = sh.block;
    const tpl = sh.tpl;
    const isNew = !sh.id;
    return `
    <div class="grab"></div>
    <div class="sheet-head"><button type="button" class="link-btn" data-act="closeSheet">Cancelar</button><h2>${isNew ? 'Nuevo bloque' : 'Bloque'}</h2><span></span></div>
    <p class="hint" style="text-align:center;margin-top:-8px">${tpl ? `Plantilla · ${T.DAYS[sh.wd]}` : esc(cap(T.longDate(sh.key)))}</p>
    <form data-form="block" style="display:flex;flex-direction:column;gap:16px" novalidate>
      <div class="card">
        <label class="field"><span>Qué</span><input name="titulo" value="${esc(b.title)}" placeholder="Clases, grabar videos, gimnasio…" ${isNew ? 'autofocus' : ''}></label>
        <div class="field-row" style="border-bottom:1px solid var(--line)">
          <label class="field"><span>Empieza</span><input type="time" name="inicio" value="${T.fmtInput(b.start)}" step="300"></label>
          <label class="field"><span>Termina</span><input type="time" name="fin" value="${T.fmtInput(b.end)}" step="300"></label>
        </div>
        <label class="field"><span>Área</span><select name="area">${areaOptions(b.area)}</select></label>
      </div>
      ${tpl && isNew ? `
      <div class="section"><p class="label">Repetir en</p>
        <div class="chips">${T.DAYS.map((d, i) => `<label class="chip" style="display:inline-flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" name="dias" value="${i}" ${i === sh.wd ? 'checked' : ''} style="accent-color:var(--acc)">${d.slice(0, 3)}</label>`).join('')}</div>
      </div>` : ''}
      <div class="section"><p class="label">Prioridad</p>${prioPicker('prioridad', b.priority)}</div>
      <p class="hint" data-error style="color:var(--alta-fg)" hidden></p>
      <button type="submit" class="btn primary block">Guardar</button>
      ${!isNew && !tpl ? `<button type="button" class="btn block" data-act="moveBlock" data-key="${sh.key}" data-id="${sh.id}">${icon('spark', 18)}Que la secretaria lo mueva</button>` : ''}
      ${!isNew ? '<button type="button" class="btn block danger" data-act="deleteBlock">Eliminar</button>' : ''}
    </form>`;
  },

  // Opciones de un día
  dia(sh) {
    const tpl = sh.tpl;
    const name = T.DAYS[sh.wd];
    if (tpl) {
      return `
      <div class="grab"></div>
      <div class="sheet-head"><button type="button" class="link-btn" data-act="closeSheet">Cerrar</button><h2>${name}</h2><span></span></div>
      <div class="section"><p class="label">Copiar los ${name.toLowerCase()} a</p>
        <div class="chips">${T.DAYS.map((d, i) => (i === sh.wd ? '' : `<label class="chip" style="display:inline-flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" data-copy-day value="${i}" style="accent-color:var(--acc)">${d.slice(0, 3)}</label>`)).join('')}</div>
        <p class="hint">Reemplaza lo que tengan esos días en la plantilla.</p>
      </div>
      <button type="button" class="btn primary block" data-act="copyDay">Copiar</button>
      <button type="button" class="btn block danger" data-act="clearTplDay">Vaciar los ${name.toLowerCase()}</button>`;
    }
    const custom = !!st().plan[sh.key];
    return `
    <div class="grab"></div>
    <div class="sheet-head"><button type="button" class="link-btn" data-act="closeSheet">Cerrar</button><h2>${esc(cap(T.longDate(sh.key)))}</h2><span></span></div>
    <p class="hint">${custom ? 'Este día tiene cambios propios.' : 'Este día sigue tu plantilla.'}</p>
    ${custom ? '<button type="button" class="btn block" data-act="resetDay">Volver a la plantilla</button>' : ''}
    <button type="button" class="btn block" data-act="dayToTpl">Usar este día como plantilla de los ${name.toLowerCase()}</button>`;
  },

  // Primera vez
  bienvenida(sh) {
    const s = st().settings;
    if (sh.step === 1) {
      return `
      <div class="grab"></div>
      <div style="display:flex;flex-direction:column;gap:6px;text-align:center;padding:8px 4px 0">
        <h2 style="font-size:26px">Bienvenido a Rumbo</h2>
        <p class="muted" style="margin:0">Primero tu sueño: todo lo demás se acomoda alrededor.</p>
      </div>
      <div class="card">
        <div class="field-row" style="border-bottom:1px solid var(--line)">
          <label class="field"><span>Te levantas L–V</span><input type="time" data-set="wake" value="${T.fmtInput(s.wake)}"></label>
          <label class="field"><span>Sáb y dom</span><input type="time" data-set="wakeWeekend" value="${T.fmtInput(s.wakeWeekend)}"></label>
        </div>
        <label class="field"><span>Quieres dormir</span><select data-set="sleepGoal">${[360, 390, 420, 450, 480, 510, 540].map((m) => `<option value="${m}" ${m === s.sleepGoal ? 'selected' : ''}>${T.dur(m)}</option>`).join('')}</select></label>
      </div>
      <button type="button" class="btn primary block" data-act="welcome" data-step="2">Seguir</button>`;
    }
    if (sh.step === 2) {
      return `
      <div class="grab"></div>
      <div style="display:flex;flex-direction:column;gap:6px;text-align:center;padding:8px 4px 0">
        <h2 style="font-size:26px">¿Cómo quieres empezar?</h2>
        <p class="muted" style="margin:0">Tu semana se arma en la pantalla Semana › Plantilla.</p>
      </div>
      <button type="button" class="card pad" data-act="welcome" data-step="3" data-example="1" style="border:2px solid var(--acc);text-align:left">
        <strong>Con la semana de ejemplo</strong>
        <span class="small muted">La del borrador: clases de 7 a 12, una tarde por proyecto, novia, fútbol y colchones. La ajustas a tu horario real.</span>
      </button>
      <button type="button" class="card pad" data-act="welcome" data-step="3" style="border:1px solid var(--line);text-align:left">
        <strong>Con la semana vacía</strong>
        <span class="small muted">Solo tu sueño. Agregas tus bloques desde cero.</span>
      </button>`;
    }
    return `
    <div class="grab"></div>
    <div style="display:flex;flex-direction:column;gap:6px;text-align:center;padding:8px 4px 0">
      <h2 style="font-size:26px">Alarmas</h2>
      <p class="muted" style="margin:0">Cuando te toque algo importante, suena hasta que respondas.</p>
    </div>
    <div class="card">
      <div class="row"><span class="grow"><span>Escuchar el tono</span><span class="s">Radar (lo cambias en Ajustes)</span></span><button type="button" class="btn small soft" data-act="playTone" data-v="${s.tone}">Probar</button></div>
      ${'Notification' in window && Notification.permission === 'default' ? '<div class="row"><span class="grow"><span>Notificaciones</span><span class="s">Para avisarte aunque estés en otra app</span></span><button type="button" class="btn small soft" data-act="askNotify">Activar</button></div>' : ''}
    </div>
    <p class="hint">En esta primera versión las alarmas suenan mientras Rumbo esté abierto. En el iPhone agrégala a la pantalla de inicio (Compartir › Agregar a inicio).</p>
    <button type="button" class="btn primary block" data-act="welcomeDone">Empezar</button>`;
  },

  confirmar(sh) {
    return `
    <div class="grab"></div>
    <div style="display:flex;flex-direction:column;gap:6px;text-align:center;padding:8px 4px 0">
      <h2>${esc(sh.title)}</h2>
      <p class="muted" style="margin:0">${esc(sh.text)}</p>
    </div>
    <div class="btns"><button type="button" class="btn" data-act="closeSheet">Cancelar</button><button type="button" class="btn primary" data-act="${sh.act}" style="${sh.danger ? 'background:var(--alta-fg);border-color:var(--alta-fg)' : ''}">${esc(sh.ok)}</button></div>`;
  },
};

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
function change(tone, ic, k, title, sub) {
  const colors = {
    ok: ['var(--ok-bg)', 'var(--ok-fg)'],
    warn: ['var(--warn-bg)', 'var(--warn-fg)'],
    alta: ['var(--alta-bg)', 'var(--alta-fg)'],
    soft: ['var(--accsoft)', 'var(--acctext)'],
    fijo: ['var(--fijo-bg)', 'var(--fijo-fg)'],
  }[tone];
  return `
  <div class="change">
    <span class="ic" style="background:${colors[0]};color:${colors[1]}">${icon(ic, 18)}</span>
    <span class="grow" style="display:flex;flex-direction:column;gap:2px;min-width:0">
      <span class="k" style="color:${colors[1]}">${k}</span>
      <span style="font-size:16px;font-weight:600;overflow-wrap:anywhere">${esc(title)}</span>
      <span class="small muted">${esc(sub)}</span>
    </span>
  </div>`;
}

// ---------- tareas y propuestas ----------
function openNewTask(text = '', hint = '') {
  const parsed = text ? parseTask(text, todayKey()) : { title: '', duration: 60, due: todayKey(), at: null, priority: 'media', area: 'casa' };
  openSheet({ type: 'nueva', text, hint, task: parsed });
}

function readTaskForm(form) {
  const f = new FormData(form);
  const hora = f.get('hora');
  return {
    title: String(f.get('titulo') || '').trim(),
    duration: Number(f.get('duracion')) || 60,
    due: f.get('fecha') || null,
    at: hora ? T.toMin(hora) : null,
    area: f.get('area'),
    priority: f.get('prioridad') || 'media',
  };
}

function showProposal(task) {
  const p = propose(st(), task, now());
  openSheet({ type: 'propuesta', p, alt: p.ok ? p.alt : null, task, text: ui.sheet?.text });
}

function addToInbox(task) {
  st().tasks.push({ id: T.uid(), title: task.title, area: task.area, priority: task.priority, duration: task.duration, due: task.due, at: task.at, created: todayKey() });
  closeSheet();
  changed();
  toast('Guardado en pendientes.');
}

// Agenda UNA tarea ya entendida y devuelve una línea para el aviso.
function agendaOne(r) {
  if (r.repeat) {
    const res = addRecurring(st(), r, r.repeat, now());
    const times = [...new Set(res.added.map((x) => `${T.fmt(x.start)} – ${T.fmt(x.end)}`))];
    if (!res.added.length) return `${r.title} · no pude agregarlo (${res.skipped.map((x) => `${T.DAYS_PLURAL[x.wd]}: ${x.reason}`).join('; ')})`;
    let line = `${r.title} · ${T.repeatLabel(r.repeat)}${times.length === 1 ? ` ${times[0]}` : ''}`;
    if (res.guessed) line += ' (no dijiste la hora: tócalo para cambiarla)';
    if (res.cut.length) line += ` · recorté ${[...new Set(res.cut.map((c) => c.title))].join(', ')}`;
    if (res.skipped.length) line += ` · no pude ${res.skipped.map((x) => `el ${T.DAYS[x.wd].toLowerCase()} (${x.reason})`).join(', ')}`;
    return line;
  }
  const task = { title: r.title, duration: r.duration, due: r.due, at: r.at, priority: r.priority, area: r.area };
  const p = propose(st(), task, now());
  if (!p.ok) {
    st().tasks.push({ id: T.uid(), ...task, created: todayKey() });
    return `${task.title} · sin lugar, quedó en pendientes`;
  }
  applyProposal(st(), p, todayKey());
  const moved = p.changes.filter((c) => c.type === 'move').length;
  const unplaced = p.changes.filter((c) => c.type === 'unplaced').length;
  let line = `${task.title} · ${T.relDay(p.slot.key, todayKey())} ${T.fmt(p.slot.start)} – ${T.fmt(p.slot.end)}`;
  if (moved) line += ` · moví ${moved} ${moved === 1 ? 'bloque' : 'bloques'}`;
  if (unplaced) line += ` · ${unplaced} a pendientes`;
  if (p.note) line += ' · esa hora no estaba libre';
  return line;
}

// Agenda todo lo que se dijo (una o varias tareas, con o sin repetición), sin confirmar.
// Un solo "Deshacer" revierte todo.
function autoAdd(text) {
  const tasks = parseTasks(text, todayKey()).filter((r) => r.title);
  if (!tasks.length) return openNewTask(text);
  store.snapshot();
  const lines = tasks.map(agendaOne);
  changed();
  toast(lines.length === 1 ? `Agendado: ${lines[0]}.` : `Agendé ${lines.length} cosas:\n${lines.map((l) => `• ${l}`).join('\n')}`, { act: 'undo', label: 'Deshacer' });
}

// En la hoja de escribir: avisa si la frase trae varias tareas o una repetición
function refreshMulti(form) {
  const text = form.texto?.value || '';
  const tasks = text.trim() ? parseTasks(text, todayKey()) : [];
  const multi = tasks.length > 1 || !!(tasks[0] && tasks[0].repeat);
  form.dataset.multi = multi ? '1' : '';
  const hint = form.querySelector('[data-multi]');
  if (hint) {
    hint.hidden = !multi;
    if (multi) hint.textContent = tasks.length > 1 ? `Entendí ${tasks.length} tareas: ${tasks.map((t) => t.title).join(', ')}. Se agendan todas juntas.` : `Se repite ${T.repeatLabel(tasks[0].repeat)}: se agrega a tu plantilla semanal.`;
  }
  const go = form.querySelector('[data-go]');
  if (go) go.textContent = multi ? 'Agendar todo' : 'Buscarle lugar';
}

// ---------- escuchar (dictado) ----------
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

function startListening() {
  S.unlock();
  if (!Recognition) {
    openNewTask('', 'Tu navegador no deja dictar aquí. Toca el campo y usa el micrófono del teclado.');
    return;
  }
  const rec = new Recognition();
  rec.lang = 'es-CO';
  rec.interimResults = true;
  rec.continuous = false;
  ui.listening = { rec, text: '', error: '' };
  renderListening();
  rec.onresult = (e) => {
    ui.listening.text = Array.from(e.results).map((r) => r[0].transcript).join(' ');
    const p = overlay.querySelector('.transcript');
    if (p) p.textContent = ui.listening.text ? `“${ui.listening.text}”` : '';
  };
  rec.onerror = (e) => {
    if (!ui.listening) return;
    ui.listening.error = e.error === 'not-allowed' || e.error === 'service-not-allowed'
      ? 'Rumbo no tiene permiso para usar el micrófono. Actívalo en los ajustes del navegador.'
      : e.error === 'no-speech' ? 'No te escuché. Intenta otra vez.' : 'No se pudo escuchar. Intenta otra vez o escríbelo.';
  };
  rec.onend = () => {
    const l = ui.listening;
    ui.listening = null;
    overlay.innerHTML = '';
    if (!l || l.cancelled) return;
    if (!l.text.trim()) openNewTask('', l.error || 'No te escuché. Escríbelo o intenta otra vez.');
    else if (st().settings.autoAdd) autoAdd(l.text.trim());
    else openNewTask(l.text.trim());
  };
  try {
    rec.start();
  } catch (e) {
    ui.listening = null;
    overlay.innerHTML = '';
    openNewTask('', 'No se pudo usar el micrófono. Escríbelo aquí.');
  }
}

function renderListening() {
  overlay.innerHTML = `
  <div class="overlay listen">
    <div class="panel" role="dialog" aria-label="Te escucho">
      <span style="width:40px;height:5px;border-radius:3px;background:var(--line)"></span>
      <span class="eyebrow" style="color:var(--acctext)">Te escucho</span>
      <div class="eq" aria-hidden="true">${'<span></span>'.repeat(11)}</div>
      <p class="transcript" aria-live="polite"></p>
      <span class="small muted" style="text-align:center">Dime qué tienes que hacer, para cuándo y cuánto te toma.</span>
      <div class="btns" style="width:100%"><button type="button" class="btn" data-act="cancelListen">Cancelar</button><button type="button" class="btn primary" data-act="stopListen">Listo</button></div>
    </div>
  </div>`;
}

// ---------- alarmas ----------
const alerted = new Set(JSON.parse(sessionStorage.getItem('rumbo.alerted') || '[]'));
const snoozed = {};
function mark(id) {
  alerted.add(id);
  try { sessionStorage.setItem('rumbo.alerted', JSON.stringify([...alerted].slice(-200))); } catch (e) { /* lleno */ }
}

async function notify(title, body, tag, urgent) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    const opts = { body, tag, renotify: true, requireInteraction: !!urgent, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png' };
    if (reg) reg.showNotification(title, opts);
    else new Notification(title, opts);
  } catch (e) { /* sin notificaciones */ }
}

let lastMinute = -1;
function tick() {
  const s = st();
  const n = now();
  if (!s.onboarded) return;
  const list = fullDay(n.key).filter((b) => !(b.auto && b.area === '_sueno'));
  for (const b of list) {
    const base = `${n.key}:${b.id}:${b.start}`;
    // aviso previo
    if (s.settings.notifyBefore && !b.auto && n.min >= b.start - s.settings.notifyBefore && n.min < b.start && !alerted.has(`pre:${base}`)) {
      mark(`pre:${base}`);
      notify(`En ${Math.round(b.start - n.min)} min: ${b.title}`, `${T.fmt(b.start)} – ${T.fmt(b.end)}`, `pre-${b.id}`, false);
      if (s.settings.alarms && b.priority !== 'baja' && b.priority !== 'flexible') S.play(s.settings.tone, 0.5);
    }
    // al empezar (o al terminar la posposición)
    const due = snoozed[base] ?? b.start;
    if (n.min >= due && n.min < due + 3 && n.min < b.end && !alerted.has(`start:${base}:${due}`)) {
      mark(`start:${base}:${due}`);
      if (!s.settings.alarms) continue;
      const urgent = b.priority === 'fijo' || b.priority === 'alta';
      notify(b.auto ? 'Hora de desconectarte' : `Es hora de: ${b.title}`, `${T.fmt(b.start)} – ${T.fmt(b.end)} · ${M.prioName(b.priority)}`, `start-${b.id}`, urgent);
      if (urgent) showAlarm(b, n.key);
      else if (b.priority === 'media') { S.play(s.settings.tone); toast(`Es hora de: ${b.title}`); }
      else toast(`Ahora: ${b.title}`);
    }
    // al terminar: ¿lo cumpliste?
    if (s.settings.askDone && !b.auto && b.priority !== 'flexible' && b.done == null && n.min >= b.end && n.min < b.end + 3 && !alerted.has(`end:${base}`)) {
      mark(`end:${base}`);
      toast(`¿Cumpliste "${b.title}"?`, { act: 'markDone', label: 'Sí', data: `data-key="${n.key}" data-id="${b.id}" data-v="1"` });
    }
  }
  // refrescar Hoy una vez por minuto para que avance la hora
  const minute = Math.floor(n.min);
  if (minute !== lastMinute && ui.tab === 'hoy' && !ui.sheet && !document.activeElement?.matches('input,select,textarea')) render();
  lastMinute = minute;
}

function showAlarm(b, key) {
  ui.alarm = { b, key };
  S.startLoop(st().settings.tone);
  overlay.innerHTML = `
  <div class="overlay alarm" role="alertdialog" aria-label="Alarma: ${esc(b.title)}">
    <span class="eyebrow">${esc(T.longDate(key))}</span>
    <span class="clock">${T.fmt(b.start)}</span>
    <div class="rings" aria-hidden="true"><span></span><span></span><b>${icon('bell')}</b></div>
    <div class="what"><span class="muted">Es hora de</span><strong>${esc(b.title)}</strong><span class="muted">${T.dur(b.end - b.start)} · prioridad ${M.prioName(b.priority).toLowerCase()}</span></div>
    <div class="actions">
      <button type="button" class="btn primary block" style="height:56px;font-size:18px" data-act="alarmStart">Empezar</button>
      <div class="btns">
        <button type="button" class="btn" data-act="alarmSnooze">Posponer 10 min</button>
        ${b.auto ? '' : `<button type="button" class="btn" data-act="alarmMove">${icon('spark', 16)}Moverlo</button>`}
      </div>
    </div>
  </div>`;
}

function closeAlarm() {
  S.stopLoop();
  ui.alarm = null;
  overlay.innerHTML = '';
}

// Reagendar un bloque existente con el motor
function proposeMove(key, id) {
  const b = M.dayBlocks(st(), key).find((x) => x.id === id);
  if (!b) return;
  const n = now();
  const started = key === n.key && b.start < n.min;
  const remaining = started ? Math.max(15, Math.round(b.end - n.min)) : b.end - b.start;
  // Si ya empezó, lo que llevas hecho se queda en su lugar y solo se mueve lo que falta
  const keepEnd = Math.floor(n.min / 5) * 5;
  const keep = started && keepEnd > b.start ? { key, block: { ...b, end: keepEnd } } : null;
  const task = { title: b.title, area: b.area, priority: b.priority === 'fijo' ? 'alta' : b.priority, duration: remaining, due: null, excludeId: id, excludeKey: key, moves: (b.moves || 0) + 1, keep };
  const p = propose(st(), task, n);
  openSheet({ type: 'propuesta', p, alt: p.ok ? p.alt : null, task });
}

// ---------- acciones ----------
const ACT = {
  tab(d) {
    ui.tab = d.tab;
    sessionStorage.setItem('rumbo.tab', ui.tab);
    closeSheet();
    render();
    window.scrollTo(0, 0);
  },
  toggleTheme() {
    st().settings.theme = isDark() ? 'light' : 'dark';
    changed();
  },
  setTheme(d) {
    st().settings.theme = d.v;
    changed();
  },
  closeSheet,
  newTask() {
    openNewTask();
  },
  listen() {
    closeSheet();
    startListening();
  },
  stopListen() {
    ui.listening?.rec.stop();
  },
  cancelListen() {
    if (ui.listening) {
      ui.listening.cancelled = true;
      ui.listening.rec.abort();
    }
    overlay.innerHTML = '';
  },
  logSleep(d) {
    st().sleepLog[todayKey()] = Number(d.h);
    changed();
    toast('Anotado.');
  },
  logSleepForm() {
    st().sleepLog[$('#sleepDay').value] = Number($('#sleepHours').value);
    changed();
    toast('Noche guardada.');
  },
  markDone(d) {
    const b = M.findBlock(st(), d.key, d.id);
    if (!b) return;
    b.done = d.v === '1' ? true : d.v === '0' ? false : null;
    $('#toast').innerHTML = '';
    changed();
  },
  moveBlock(d) {
    proposeMove(d.key, d.id);
  },
  scheduleTask(d) {
    const t = st().tasks.find((x) => x.id === d.id);
    if (!t) return;
    const p = propose(st(), { ...t }, now());
    openSheet({ type: 'propuesta', p, alt: p.ok ? p.alt : null, task: { ...t } });
  },
  deleteTask(d) {
    st().tasks = st().tasks.filter((t) => t.id !== d.id);
    changed();
  },
  confirmProposal() {
    const p = ui.sheet.p;
    store.snapshot();
    applyProposal(st(), p, todayKey());
    const keep = p.task && p.task.keep;
    if (keep) {
      const list = M.ensureDay(st(), keep.key);
      list.push(keep.block);
      list.sort((a, b) => a.start - b.start);
    }
    closeSheet();
    changed();
    toast('Listo, ya está en tu agenda.', { act: 'undo', label: 'Deshacer' });
  },
  altProposal() {
    const sh = ui.sheet;
    openSheet({ ...sh, p: sh.alt, alt: sh.p });
  },
  saveInbox() {
    const t = ui.sheet.task;
    if (t.excludeId) {
      // mover un bloque a pendientes: se quita de su día
      const list = M.ensureDay(st(), t.excludeKey);
      const i = list.findIndex((b) => b.id === t.excludeId);
      if (i >= 0) list.splice(i, 1);
      if (t.keep) list.push(t.keep.block);
      list.sort((a, b) => a.start - b.start);
    }
    if (t.id) {
      closeSheet();
      changed();
      return;
    }
    addToInbox(t);
  },
  backToTask() {
    const sh = ui.sheet;
    if (sh.task && !sh.task.excludeId && !sh.task.id) openSheet({ type: 'nueva', text: sh.text || '', task: sh.task });
    else closeSheet();
  },
  undo() {
    if (store.undo()) {
      $('#toast').innerHTML = '';
      render();
      toast('Deshecho.');
    }
  },
  weekMode(d) {
    ui.mode = d.mode;
    render();
  },
  weekNav(d) {
    ui.week = d.d === '0' ? 0 : ui.week + Number(d.d);
    render();
  },
  revWeek(d) {
    ui.revWeek = Number(d.w);
    render();
  },
  planNext() {
    ui.tab = 'semana';
    ui.mode = 'plan';
    ui.week = 1;
    render();
    window.scrollTo(0, 0);
  },
  colClick(d, el, e) {
    const rect = el.getBoundingClientRect();
    const min = Math.max(0, Math.min(1380, Math.floor(((e.clientY - rect.top) / H) * 4) * 15));
    const tpl = ui.mode === 'tpl';
    openSheet({ type: 'bloque', tpl, key: tpl ? null : d.key, wd: Number(d.wd), id: null, block: { title: '', start: min, end: Math.min(1440, min + 60), area: 'personal', priority: 'media' } });
  },
  editBlock(d) {
    const tpl = ui.mode === 'tpl' && ui.tab === 'semana' && !d.key;
    const wd = d.wd != null && d.wd !== '' ? Number(d.wd) : T.weekday(d.key);
    const list = tpl ? st().template[wd] : M.dayBlocks(st(), d.key);
    const b = list.find((x) => x.id === d.id);
    if (!b) return;
    openSheet({ type: 'bloque', tpl, key: tpl ? null : d.key, wd, id: b.id, block: { ...b } });
  },
  deleteBlock() {
    const sh = ui.sheet;
    if (sh.tpl) st().template[sh.wd] = st().template[sh.wd].filter((b) => b.id !== sh.id);
    else st().plan[sh.key] = M.ensureDay(st(), sh.key).filter((b) => b.id !== sh.id);
    closeSheet();
    changed();
    toast('Bloque eliminado.');
  },
  dayMenu(d) {
    openSheet({ type: 'dia', tpl: ui.mode === 'tpl', key: d.key, wd: Number(d.wd) });
  },
  copyDay() {
    const sh = ui.sheet;
    const targets = [...sheets.querySelectorAll('[data-copy-day]:checked')].map((x) => Number(x.value));
    if (!targets.length) return toast('Elige al menos un día.');
    for (const i of targets) st().template[i] = st().template[sh.wd].map((b) => ({ ...b, id: T.uid() }));
    closeSheet();
    changed();
    toast(`Copiado a ${targets.length} ${targets.length === 1 ? 'día' : 'días'}.`);
  },
  clearTplDay() {
    st().template[ui.sheet.wd] = [];
    closeSheet();
    changed();
  },
  resetDay() {
    delete st().plan[ui.sheet.key];
    closeSheet();
    changed();
    toast('El día volvió a la plantilla.');
  },
  dayToTpl() {
    const sh = ui.sheet;
    st().template[sh.wd] = M.dayBlocks(st(), sh.key).map((b) => ({ ...b, id: T.uid(), done: null, moves: 0, source: undefined }));
    closeSheet();
    changed();
    toast('Plantilla actualizada.');
  },
  toggleSetting(d) {
    st().settings[d.key] = !st().settings[d.key];
    changed();
  },
  setTone(d) {
    st().settings.tone = d.v;
    S.play(d.v);
    changed();
  },
  playTone(d) {
    S.unlock();
    S.play(d.v);
  },
  async askNotify() {
    try {
      await Notification.requestPermission();
    } catch (e) { /* sin soporte */ }
    if (ui.sheet) renderSheet();
    render();
  },
  testAlarm() {
    S.unlock();
    toast('La alarma suena en 5 segundos.');
    setTimeout(() => {
      const n = now();
      notify('Es hora de: Prueba de alarma', 'Así te avisa Rumbo', 'test', true);
      showAlarm({ id: 'test', title: 'Prueba de alarma', start: Math.floor(n.min), end: Math.floor(n.min) + 30, priority: 'alta', area: 'personal', auto: true }, n.key);
    }, 5000);
  },
  alarmStart() {
    const a = ui.alarm;
    closeAlarm();
    if (a && !a.b.auto) toast(`¡Vamos! ${a.b.title} hasta las ${T.fmt(a.b.end)}.`);
  },
  alarmSnooze() {
    const a = ui.alarm;
    closeAlarm();
    if (!a) return;
    snoozed[`${a.key}:${a.b.id}:${a.b.start}`] = Math.floor(now().min) + 10;
    toast('Te aviso otra vez en 10 minutos.');
  },
  alarmMove() {
    const a = ui.alarm;
    closeAlarm();
    if (a) proposeMove(a.key, a.b.id);
  },
  addArea() {
    const used = new Set(st().areas.map((a) => a.color));
    const color = M.AREA_COLORS.find((c) => !used.has(c)) || '#64748B';
    st().areas.push({ id: T.uid(), name: 'Nueva área', color });
    changed();
  },
  deleteArea(d) {
    const s = st();
    const inUse = Object.values(s.template).some((l) => l.some((b) => b.area === d.id)) || Object.values(s.plan).some((l) => l.some((b) => b.area === d.id));
    if (inUse) return toast('Esa área tiene bloques. Cámbialos de área primero.');
    if (s.areas.length <= 1) return;
    s.areas = s.areas.filter((a) => a.id !== d.id);
    changed();
  },
  exportData() {
    const blob = new Blob([store.exportJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `rumbo-respaldo-${todayKey()}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1000);
  },
  loadExample() {
    openSheet({ type: 'confirmar', title: '¿Cargar la semana de ejemplo?', text: 'Reemplaza tu plantilla actual. Los días que ya cambiaste se quedan como están.', ok: 'Cargar', act: 'loadExampleOk' });
  },
  loadExampleOk() {
    store.backup();
    st().template = M.exampleTemplate();
    closeSheet();
    changed();
    toast('Semana de ejemplo cargada.');
  },
  resetAll() {
    openSheet({ type: 'confirmar', title: '¿Borrar todo?', text: 'Se borra tu agenda de este dispositivo. Queda una copia de respaldo por si acaso.', ok: 'Borrar todo', act: 'resetAllOk', danger: true });
  },
  resetAllOk() {
    store.reset();
    closeSheet();
    ui.tab = 'hoy';
    render();
    openSheet({ type: 'bienvenida', step: 1, locked: true });
  },
  welcome(d) {
    if (d.step === '3') st().template = d.example ? M.exampleTemplate() : { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
    store.save();
    openSheet({ type: 'bienvenida', step: Number(d.step), locked: true });
  },
  welcomeDone() {
    st().onboarded = true;
    st().since = todayKey();
    closeSheet();
    ui.tab = 'semana';
    ui.mode = 'tpl';
    changed();
    toast('Toca un espacio vacío para agregar un bloque.');
  },
};

// ---------- eventos ----------
document.addEventListener('click', (e) => {
  S.unlock();
  const el = e.target.closest('[data-act]');
  if (!el || !el.dataset.act) return;
  const fn = ACT[el.dataset.act];
  if (!fn) return;
  e.preventDefault();
  fn(el.dataset, el, e);
});

document.addEventListener('submit', (e) => {
  const form = e.target.closest('form[data-form]');
  if (!form) return;
  e.preventDefault();
  const err = form.querySelector('[data-error]');
  const fail = (msg) => {
    err.textContent = msg;
    err.hidden = false;
  };
  if (form.dataset.form === 'task') {
    if (form.dataset.multi === '1' && e.submitter?.value !== 'inbox') {
      const text = form.texto.value;
      closeSheet();
      return autoAdd(text);
    }
    const task = readTaskForm(form);
    if (!task.title) return fail('Escribe qué hay que hacer.');
    ui.sheet.task = task;
    ui.sheet.text = form.texto.value;
    if (e.submitter?.value === 'inbox') return addToInbox(task);
    return showProposal(task);
  }
  if (form.dataset.form === 'block') {
    const sh = ui.sheet;
    const f = new FormData(form);
    const title = String(f.get('titulo') || '').trim();
    const start = T.toMin(f.get('inicio'));
    let end = T.toMin(f.get('fin'));
    if (end === 0) end = 1440;
    if (!title) return fail('Escribe qué es este bloque.');
    if (end <= start) return fail('La hora de terminar debe ser después de la de empezar.');
    const data = { title, start, end, area: f.get('area'), priority: f.get('prioridad') || 'media' };
    const days = sh.tpl ? (sh.id ? [sh.wd] : f.getAll('dias').map(Number)) : [null];
    if (!days.length) return fail('Elige al menos un día.');
    // revisar que no se cruce con otros bloques ni con el sueño
    for (const wd of days) {
      const list = sh.tpl ? st().template[wd] : M.dayBlocks(st(), sh.key);
      const clash = list.find((b) => b.id !== sh.id && b.start < end && b.end > start);
      if (clash) return fail(`Se cruza con "${clash.title}" (${T.fmt(clash.start)} – ${T.fmt(clash.end)})${sh.tpl ? ` el ${T.DAYS[wd].toLowerCase()}` : ''}.`);
      const [ws, we] = M.awakeWindow(st().settings, sh.tpl ? wd : T.weekday(sh.key));
      if (start < ws || end > we) return fail(`Ese horario choca con tu sueño o tu desconexión (estás despierto de ${T.fmt(ws)} a ${T.fmt(we)}). Cámbialo en Sueño si hace falta.`);
    }
    if (sh.tpl) {
      for (const wd of days) {
        const list = st().template[wd];
        const b = sh.id && list.find((x) => x.id === sh.id);
        if (b) Object.assign(b, data);
        else list.push(M.block(start, end, data.area, title, data.priority));
        list.sort((a, b2) => a.start - b2.start);
      }
    } else {
      const list = M.ensureDay(st(), sh.key);
      const b = sh.id && list.find((x) => x.id === sh.id);
      if (b) Object.assign(b, data);
      else list.push(M.block(start, end, data.area, title, data.priority));
      list.sort((a, b2) => a.start - b2.start);
    }
    closeSheet();
    changed();
  }
});

// Lo que escribes en "Dímelo como quieras" llena los campos al instante
let parseTimer = null;
document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.name === 'texto' && t.form?.dataset.form === 'task') {
    clearTimeout(parseTimer);
    parseTimer = setTimeout(() => {
      const r = parseTask(t.value, todayKey());
      const f = t.form;
      if (!t.value.trim()) return;
      refreshMulti(f);
      f.titulo.value = r.title;
      if (!r.durationGuessed) setSelect(f.duracion, r.duration);
      f.fecha.value = r.due || '';
      f.hora.value = r.at != null ? T.fmtInput(r.at) : '';
      f.area.value = r.area;
      const radio = f.querySelector(`input[name="prioridad"][value="${r.priority}"]`);
      if (radio) radio.checked = true;
    }, 250);
  }
  if (t.dataset.areaName) {
    const a = st().areas.find((x) => x.id === t.dataset.areaName);
    if (a) {
      a.name = t.value.trim() || 'Sin nombre';
      store.save();
    }
  }
});

function setSelect(sel, value) {
  if (![...sel.options].some((o) => Number(o.value) === value)) sel.add(new Option(T.dur(value), value));
  sel.value = String(value);
}

document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.set) {
    const k = t.dataset.set;
    st().settings[k] = t.type === 'time' ? T.toMin(t.value) : Number(t.value);
    store.save();
    if (ui.sheet?.type === 'bienvenida') return;
    render();
  }
  if (t.dataset.areaColor) {
    const a = st().areas.find((x) => x.id === t.dataset.areaColor);
    if (a) {
      a.color = t.value;
      changed();
    }
  }
  if (t.matches('[data-import]') && t.files[0]) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        store.importJSON(reader.result);
        render();
        toast('Respaldo restaurado.');
      } catch (err) {
        toast(err.message || 'No se pudo leer el archivo.');
      }
    };
    reader.readAsText(t.files[0]);
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (ui.alarm) return ACT.alarmStart();
    if (ui.listening) return ACT.cancelListen();
    if (ui.sheet && !ui.sheet.locked) closeSheet();
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') tick();
});

// ---------- arranque ----------
render();
if (!st().onboarded) openSheet({ type: 'bienvenida', step: 1, locked: true });
setInterval(tick, 10000);
setTimeout(tick, 1000);

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
