// Modelo de datos de Rumbo: áreas, prioridades, plantilla semanal, días y sueño.
// Todo es puro (sin DOM ni localStorage) para poder probarlo con node.
import { toMin, weekday, uid } from './time.js';

export const PRIORITIES = [
  { id: 'fijo', name: 'Fijo', rank: 4, desc: 'Nunca se mueve: clases, sueño, citas.' },
  { id: 'alta', name: 'Alta', rank: 3, desc: 'Solo se mueve si tú lo apruebas.' },
  { id: 'media', name: 'Media', rank: 2, desc: 'Puede pasar a otro día de la semana.' },
  { id: 'baja', name: 'Baja', rank: 1, desc: 'Va donde haya espacio.' },
  { id: 'flexible', name: 'Flexible', rank: 0, desc: 'Relleno. Es lo primero que se usa.' },
];
export const RANK = Object.fromEntries(PRIORITIES.map((p) => [p.id, p.rank]));
export const prioName = (id) => (PRIORITIES.find((p) => p.id === id) || PRIORITIES[2]).name;

export const DEFAULT_AREAS = [
  { id: 'tras', name: 'Trascendencia', color: '#B08D57' },
  { id: 'web', name: 'WebNaria', color: '#3B82F6' },
  { id: 'prod', name: 'Productos', color: '#2A9D8F' },
  { id: 'afil', name: 'Afiliados', color: '#E07A1F' },
  { id: 'uni', name: 'Universidad', color: '#8A929C' },
  { id: 'novia', name: 'Novia', color: '#E5484D' },
  { id: 'futbol', name: 'Fútbol', color: '#2FA84F' },
  { id: 'casa', name: 'Casa y pendientes', color: '#D9A400' },
  { id: 'personal', name: 'Personal', color: '#7C8799' },
];

export const AREA_COLORS = ['#B08D57', '#3B82F6', '#2A9D8F', '#E07A1F', '#8A929C', '#E5484D', '#2FA84F', '#D9A400', '#7C8799', '#0EA5E9', '#A16207', '#64748B'];

export const DEFAULT_SETTINGS = {
  theme: 'auto',          // auto | light | dark
  wake: 360,              // hora de levantarse lunes a viernes (min)
  wakeWeekend: 420,       // sábado y domingo
  sleepGoal: 450,         // meta de sueño (min)
  sleepMin: 390,          // mínimo intocable (min)
  windDown: 30,           // desconexión antes de dormir (min)
  tone: 'radar',
  alarms: true,           // sonar al empezar cada bloque
  notifyBefore: 10,       // aviso previo en minutos (0 = no)
  askDone: true,          // preguntar al terminar si se cumplió
};

export function newState() {
  return {
    v: 1,
    onboarded: false,
    since: null,   // fecha en que empezaste a usar Rumbo (la revisión cuenta desde ahí)
    settings: { ...DEFAULT_SETTINGS },
    areas: DEFAULT_AREAS.map((a) => ({ ...a })),
    template: { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] },
    plan: {},      // 'AAAA-MM-DD' → bloques de ese día (solo los días que cambiaste)
    tasks: [],     // pendientes sin hora (bandeja)
    sleepLog: {},  // 'AAAA-MM-DD' (día en que te levantaste) → horas dormidas
    stats: { moved: 0, scheduled: 0 },
  };
}

// Completa un estado guardado con lo que le falte (por si la app agrega campos nuevos).
export function normalize(s) {
  const base = newState();
  if (!s || typeof s !== 'object') return base;
  const out = { ...base, ...s };
  out.settings = { ...base.settings, ...(s.settings || {}) };
  out.areas = Array.isArray(s.areas) && s.areas.length ? s.areas : base.areas;
  out.template = { ...base.template, ...(s.template || {}) };
  out.plan = s.plan || {};
  out.tasks = Array.isArray(s.tasks) ? s.tasks : [];
  out.sleepLog = s.sleepLog || {};
  out.stats = { ...base.stats, ...(s.stats || {}) };
  return out;
}

export function block(start, end, area, title, priority = 'media', extra = {}) {
  return { id: uid(), start, end, area, title, priority, done: null, moves: 0, ...extra };
}

// Ventana de sueño de un día de la semana (0 = lunes).
// bed puede pasar de 1440 si te acuestas después de medianoche.
export function sleepInfo(settings, wd) {
  const wake = wd >= 5 ? settings.wakeWeekend : settings.wake;
  let bed = wake - settings.sleepGoal;
  if (bed < 0) bed += 1440;
  if (bed <= wake) bed += 1440; // te acuestas después de medianoche
  const windStart = bed - settings.windDown;
  return { wake, bed, windStart };
}

// Rango del día en el que se puede agendar: desde que te levantas hasta la desconexión.
export function awakeWindow(settings, wd) {
  const { wake, windStart } = sleepInfo(settings, wd);
  return [wake, Math.min(windStart, 1440)];
}

// Bloques automáticos de sueño y desconexión para pintar (no se guardan).
export function sleepBlocks(settings, wd) {
  const prev = sleepInfo(settings, (wd + 6) % 7);
  const { wake, bed, windStart } = sleepInfo(settings, wd);
  const out = [];
  // Madrugada: desde que te dormiste la noche anterior (si fue después de medianoche) hasta levantarte
  const from = prev.bed > 1440 ? prev.bed - 1440 : 0;
  out.push({ id: `sleep-am-${wd}`, start: from, end: wake, area: '_sueno', title: 'Sueño', priority: 'fijo', auto: true });
  if (windStart < 1440) {
    out.push({ id: `wind-${wd}`, start: windStart, end: Math.min(bed, 1440), area: '_desc', title: 'Desconexión', priority: 'alta', auto: true });
  }
  if (bed < 1440) {
    out.push({ id: `sleep-pm-${wd}`, start: bed, end: 1440, area: '_sueno', title: 'Sueño', priority: 'fijo', auto: true });
  }
  return out;
}

// Bloques de un día: los que cambiaste para esa fecha o, si no, los de la plantilla.
export function dayBlocks(state, key) {
  const list = state.plan[key] || state.template[weekday(key)] || [];
  return list.slice().sort((a, b) => a.start - b.start);
}

// Copia la plantilla a la fecha para poder editar solo ese día.
// Conserva los id de la plantilla: así un bloque se reconoce aunque el día se copie después.
export function ensureDay(state, key) {
  if (!state.plan[key]) {
    state.plan[key] = (state.template[weekday(key)] || []).map((b) => ({ ...b, done: null, moves: 0 }));
  }
  return state.plan[key];
}

export function findBlock(state, key, id) {
  return ensureDay(state, key).find((b) => b.id === id) || null;
}

// Semana de ejemplo basada en el borrador (para empezar rápido y ajustarla).
export function exampleTemplate() {
  const t = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  const H = (s) => toMin(s);
  const tarde = [
    ['tras', 'Trascendencia: grabar lote de videos'],
    ['prod', 'Productos: construir la plataforma'],
    ['web', 'WebNaria: grabar lote de videos'],
    ['prod', 'Productos: construir la plataforma'],
    ['afil', 'Afiliados: avanzar el sistema'],
  ];
  for (let d = 0; d < 5; d++) {
    t[d].push(block(H('06:00'), H('07:00'), 'personal', 'Rutina y desayuno', 'alta'));
    t[d].push(block(H('07:00'), H('12:00'), 'uni', 'Clases (ajústalas)', 'fijo'));
    t[d].push(block(H('12:00'), H('13:00'), 'personal', 'Almuerzo', 'alta'));
    t[d].push(block(H('13:00'), H('17:00'), tarde[d][0], tarde[d][1], 'media'));
    t[d].push(block(H('17:30'), H('18:30'), 'casa', 'Colchón: lo que surgió', 'flexible'));
  }
  t[1].push(block(H('19:00'), H('22:00'), 'novia', 'Novia', 'fijo'));
  t[2].push(block(H('19:00'), H('21:00'), 'futbol', 'Fútbol', 'fijo'));
  t[4].push(block(H('19:00'), H('22:00'), 'novia', 'Novia', 'fijo'));
  t[5].push(block(H('08:00'), H('10:00'), 'futbol', 'Fútbol', 'fijo'));
  t[5].push(block(H('13:00'), H('15:00'), 'casa', 'Colchón: lo que surgió', 'flexible'));
  t[5].push(block(H('19:00'), H('22:30'), 'novia', 'Novia', 'fijo'));
  t[6].push(block(H('20:00'), H('20:30'), 'personal', 'Revisión semanal', 'alta'));
  return t;
}
