// Motor de agenda: decide dónde va una tarea nueva.
// Reglas: primero busca tiempo libre; si no hay, usa bloques de MENOR prioridad
// (los Flexibles se consumen, los demás se mueven a otro hueco); nunca toca lo Fijo,
// lo de igual o mayor prioridad, ni el sueño. No cambia nada: devuelve una propuesta
// que solo se aplica cuando el usuario la confirma.
import { RANK, dayBlocks, awakeWindow } from './model.js';
import { addDays, weekday, roundUp, uid } from './time.js';

const STEP = 15;
const LOOKAHEAD = 6; // días hacia adelante cuando la tarea no tiene fecha límite
const COST = { flexible: 0.2, baja: 1, media: 2, alta: 3 };

// Huecos libres dentro de [ws, we] que no chocan con ningún bloque, empezando en `from`.
export function freeGaps(blocks, ws, we, from = ws) {
  const start0 = Math.max(ws, from);
  const busy = blocks
    .filter((b) => b.end > start0 && b.start < we)
    .map((b) => [Math.max(b.start, start0), Math.min(b.end, we)])
    .sort((a, b) => a[0] - b[0]);
  const gaps = [];
  let cur = start0;
  for (const [s, e] of busy) {
    if (s > cur) gaps.push({ start: cur, end: s });
    cur = Math.max(cur, e);
  }
  if (cur < we) gaps.push({ start: cur, end: we });
  return gaps;
}

// Copia de trabajo de los días que se van tocando.
function workspace(state) {
  const days = {};
  return {
    days,
    get(key) {
      if (!days[key]) days[key] = dayBlocks(state, key).map((b) => ({ ...b }));
      return days[key];
    },
  };
}

function windowFor(state, key, now) {
  const [ws, we] = awakeWindow(state.settings, weekday(key));
  const from = key === now.key ? Math.max(ws, roundUp(now.min + 5, 5)) : ws;
  return { ws, we, from };
}

function findFree(state, ws, dur, startKey, endKey, now, firstFrom = null) {
  for (let key = startKey; key <= endKey; key = addDays(key, 1)) {
    const w = windowFor(state, key, now);
    const from = key === startKey && firstFrom != null ? Math.max(w.from, roundUp(firstFrom, 5)) : w.from;
    for (const g of freeGaps(ws.get(key), w.ws, w.we, from)) {
      const s = roundUp(g.start, 5);
      if (g.end - s >= dur) return { key, start: s, end: s + dur };
    }
  }
  return null;
}

const overlap = (b, s, e) => Math.max(0, Math.min(b.end, e) - Math.max(b.start, s));

// Mejor tramo de un día ocupando bloques de menor prioridad.
function bestBump(blocks, w, dur, rank) {
  const lo = w.from;
  const cands = new Set();
  for (let t = roundUp(lo, STEP); t + dur <= w.we; t += STEP) cands.add(t);
  for (const b of blocks) for (const t of [b.start, b.end - dur, b.end]) if (t >= lo && t + dur <= w.we) cands.add(t);
  let best = null;
  for (const s of cands) {
    const e = s + dur;
    const hits = blocks.filter((b) => b.start < e && b.end > s);
    if (!hits.length) continue; // eso sería tiempo libre, ya se buscó antes
    if (hits.some((b) => b.auto || b.done === true || (RANK[b.priority] ?? 2) >= rank)) continue;
    let cost = (s - w.ws) / 1000;
    for (const b of hits) {
      cost += overlap(b, s, e) * (COST[b.priority] ?? 2);
      if (b.start < s && b.end > e) cost += 30; // partir un bloque en dos se evita
    }
    if (!best || cost < best.cost) best = { start: s, end: e, cost, hits };
  }
  return best;
}

// Quita [s, e] de un bloque. Devuelve el bloque recortado (o null si desaparece) y el trozo que sobra.
function cut(list, b, s, e) {
  const i = list.indexOf(b);
  const cs = Math.max(b.start, s);
  const ce = Math.min(b.end, e);
  if (cs <= b.start && ce >= b.end) {
    list.splice(i, 1);
  } else if (cs <= b.start) {
    b.start = ce;
  } else if (ce >= b.end) {
    b.end = cs;
  } else {
    list.push({ ...b, id: uid(), start: ce });
    b.end = cs;
  }
  return ce - cs;
}

function sortDay(list) {
  list.sort((a, b) => a.start - b.start);
}

// Hace espacio en [s, e] del día `key` moviendo los bloques que estorban.
function makeRoom(state, ws, key, s, e, now, changes, unplaced) {
  const list = ws.get(key);
  const hits = list.filter((b) => b.start < e && b.end > s).sort((a, b) => a.start - b.start);
  const pieces = [];
  for (const b of hits) {
    const cs = Math.max(b.start, s);
    const len = cut(list, b, s, e);
    const from = { key, start: cs, end: cs + len };
    if (b.priority === 'flexible') {
      changes.push({ type: 'use', title: b.title, ...from });
    } else {
      pieces.push({ b, len, from });
    }
  }
  return pieces;
}

function relocate(state, ws, pieces, key, after, now, changes, unplaced) {
  for (const { b, len, from } of pieces) {
    const moves = (b.moves || 0) + 1;
    const promoted = moves >= 2 && (RANK[b.priority] ?? 2) < RANK.alta;
    const piece = { ...b, id: uid(), moves, priority: promoted ? 'alta' : b.priority, done: null };
    const spot = findFree(state, ws, len, key, addDays(key, LOOKAHEAD), now, after);
    if (spot) {
      const target = ws.get(spot.key);
      target.push({ ...piece, start: spot.start, end: spot.end });
      sortDay(target);
      changes.push({ type: 'move', title: b.title, priority: piece.priority, promoted, from, to: spot });
    } else {
      unplaced.push({ title: b.title, area: b.area, priority: piece.priority, duration: len, moves });
      changes.push({ type: 'unplaced', title: b.title, duration: len });
    }
  }
}

function newBlock(task, slot) {
  return {
    id: uid(),
    start: slot.start,
    end: slot.end,
    area: task.area || 'personal',
    title: task.title,
    priority: task.priority || 'media',
    done: null,
    moves: task.moves || 0,
    source: 'secretaria',
  };
}

function finish(ws, kind, slot, changes, unplaced, task) {
  return { ok: true, kind, slot, days: ws.days, changes, unplaced, task };
}

/**
 * Propone dónde poner una tarea.
 * task: { title, area, priority, duration (min), due ('AAAA-MM-DD' | null), at (min | null), excludeId }
 * now:  { key: 'AAAA-MM-DD', min: minutos de ahora }
 */
export function propose(state, task, now) {
  const dur = Math.max(5, Math.round(task.duration || 60));
  const rank = RANK[task.priority] ?? 2;
  const startKey = task.due && task.at != null ? task.due : now.key;
  const endKey = task.due && task.due >= now.key ? task.due : addDays(now.key, LOOKAHEAD);

  const prepare = () => {
    const ws = workspace(state);
    if (task.excludeId && task.excludeKey) {
      const list = ws.get(task.excludeKey);
      const i = list.findIndex((b) => b.id === task.excludeId);
      if (i >= 0) list.splice(i, 1);
    }
    return ws;
  };

  // 1) Hora exacta pedida ("a las 3 de la tarde")
  if (task.at != null) {
    const key = task.due || now.key;
    const ws = prepare();
    const w = windowFor(state, key, now);
    const s = task.at;
    const e = s + dur;
    const list = ws.get(key);
    const hits = list.filter((b) => b.start < e && b.end > s);
    const blocked = hits.find((b) => (RANK[b.priority] ?? 2) >= rank || b.done === true);
    const outside = s < w.ws || e > w.we || (key === now.key && s < now.min);
    if (!blocked && !outside) {
      const changes = [];
      const unplaced = [];
      const pieces = makeRoom(state, ws, key, s, e, now, changes, unplaced);
      const slot = { key, start: s, end: e };
      list.push(newBlock(task, slot));
      sortDay(list);
      relocate(state, ws, pieces, key, e, now, changes, unplaced);
      changes.unshift({ type: 'add', title: task.title, priority: task.priority, ...slot });
      return finish(ws, 'fixed', slot, changes, unplaced, task);
    }
    const reason = outside
      ? 'Esa hora cae fuera de tu día (sueño o desconexión) o ya pasó.'
      : `A esa hora ya tienes "${blocked.title}", que tiene igual o más prioridad.`;
    const other = propose(state, { ...task, at: null }, now);
    return other.ok ? { ...other, note: reason } : { ok: false, reason };
  }

  // 2) Tiempo libre hasta la fecha límite
  {
    const ws = prepare();
    const spot = findFree(state, ws, dur, startKey, endKey, now);
    if (spot) {
      const list = ws.get(spot.key);
      list.push(newBlock(task, spot));
      sortDay(list);
      return finish(ws, 'free', spot, [{ type: 'add', title: task.title, priority: task.priority, ...spot }], [], task);
    }
  }

  // 3) Hacer espacio con bloques de menor prioridad
  if (rank > 0) {
    let pick = null;
    for (let key = startKey; key <= endKey && !pick; key = addDays(key, 1)) {
      const ws0 = prepare();
      const w = windowFor(state, key, now);
      const best = bestBump(ws0.get(key), w, dur, rank);
      if (best) pick = { key, ...best };
    }
    if (pick) {
      const ws = prepare();
      const changes = [];
      const unplaced = [];
      const pieces = makeRoom(state, ws, pick.key, pick.start, pick.end, now, changes, unplaced);
      const slot = { key: pick.key, start: pick.start, end: pick.end };
      const list = ws.get(pick.key);
      list.push(newBlock(task, slot));
      sortDay(list);
      relocate(state, ws, pieces, pick.key, pick.end, now, changes, unplaced);
      changes.unshift({ type: 'add', title: task.title, priority: task.priority, ...slot });
      const result = finish(ws, 'bump', slot, changes, unplaced, task);
      // Otra opción: tiempo libre después de la fecha pedida, sin mover nada
      if (task.due) {
        const ws2 = prepare();
        const later = findFree(state, ws2, dur, addDays(task.due, 1), addDays(task.due, LOOKAHEAD), now);
        if (later) {
          const l2 = ws2.get(later.key);
          l2.push(newBlock(task, later));
          sortDay(l2);
          result.alt = finish(ws2, 'free', later, [{ type: 'add', title: task.title, priority: task.priority, ...later }], [], task);
          result.alt.late = true;
        }
      }
      return result;
    }
  }

  // 4) Sin lugar
  const hasta = task.due ? 'antes de la fecha que pediste' : 'en los próximos 7 días';
  return {
    ok: false,
    reason: `No encontré espacio ${hasta} sin tocar cosas de igual o más prioridad ni tu sueño.`,
  };
}

// Aplica una propuesta confirmada al estado.
export function applyProposal(state, p, todayKey) {
  for (const [key, blocks] of Object.entries(p.days)) {
    if (key < todayKey) continue;
    state.plan[key] = blocks.slice().sort((a, b) => a.start - b.start);
  }
  for (const u of p.unplaced) {
    state.tasks.push({ id: uid(), title: u.title, area: u.area, priority: u.priority, duration: u.duration, due: null, moves: u.moves || 0, created: todayKey });
  }
  if (p.task && p.task.id) state.tasks = state.tasks.filter((t) => t.id !== p.task.id);
  state.stats.scheduled = (state.stats.scheduled || 0) + 1;
  state.stats.moved = (state.stats.moved || 0) + p.changes.filter((c) => c.type === 'move').length;
}

/**
 * Agrega una tarea que se repite (ej. todos los domingos) a la plantilla semanal,
 * y a las fechas futuras que ya tengan cambios propios. No pisa lo de igual o mayor
 * prioridad; lo de menor prioridad que estorbe se recorta.
 * Si no trae hora, busca el primer hueco libre del día (desde las 8:00).
 */
export function addRecurring(state, task, days, now) {
  const dur = Math.max(5, Math.round(task.duration || 60));
  const rank = RANK[task.priority] ?? 4;
  const res = { added: [], skipped: [], cut: [], guessed: task.at == null };

  const place = (list, start, end, wd, record) => {
    const hits = list.filter((b) => b.start < end && b.end > start);
    const blocked = hits.find((b) => (RANK[b.priority] ?? 2) >= rank);
    if (blocked) return { ok: false, reason: `choca con "${blocked.title}"` };
    for (const b of hits) {
      if (record) res.cut.push({ wd, title: b.title });
      cut(list, b, start, end);
    }
    list.push({ id: uid(), start, end, area: task.area || 'personal', title: task.title, priority: task.priority || 'fijo', done: null, moves: 0, source: 'secretaria' });
    sortDay(list);
    return { ok: true };
  };

  for (const wd of days) {
    const [ws, we] = awakeWindow(state.settings, wd);
    const list = state.template[wd];
    let start = task.at;
    if (start == null) {
      const fit = (from) => freeGaps(list, ws, we, from).find((g) => roundUp(g.start, 5) + dur <= g.end);
      const g = fit(Math.max(ws, 480)) || fit(ws);
      if (!g) {
        res.skipped.push({ wd, reason: 'no hay un hueco libre' });
        continue;
      }
      start = roundUp(g.start, 5);
    }
    const end = start + dur;
    if (start < ws || end > we) {
      res.skipped.push({ wd, reason: 'cae en tu sueño o desconexión' });
      continue;
    }
    const r = place(list, start, end, wd, true);
    if (!r.ok) {
      res.skipped.push({ wd, reason: r.reason });
      continue;
    }
    res.added.push({ wd, start, end });
    // fechas futuras que ya tenían cambios propios
    for (const key of Object.keys(state.plan)) {
      if (key >= now.key && weekday(key) === wd) place(state.plan[key], start, end, wd, false);
    }
  }
  return res;
}
