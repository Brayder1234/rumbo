// Pruebas del motor de agenda y del entendimiento de frases.
// Correr con: node tests/logic.test.mjs
import assert from 'node:assert/strict';
import { newState, exampleTemplate, sleepInfo, sleepBlocks, dayBlocks } from '../js/model.js';
import { propose, applyProposal, freeGaps, addRecurring } from '../js/scheduler.js';
import { parseTask, parseTasks, splitTasks, parseRepeat, parseDuration, parseTime, parseDate } from '../js/parser.js';
import { toMin, fmt, dur, weekday } from '../js/time.js';

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    console.error(`✗ ${name}\n  ${e.message}`);
    process.exitCode = 1;
  }
}

const TUE = '2026-10-06'; // martes
const H = toMin;

function demo() {
  const s = newState();
  s.template = exampleTemplate();
  s.onboarded = true;
  return s;
}

// ---------- tiempo ----------
test('weekday: martes es 1', () => assert.equal(weekday(TUE), 1));
test('fmt y dur', () => {
  assert.equal(fmt(390), '6:30');
  assert.equal(dur(90), '1 h 30 min');
  assert.equal(dur(45), '45 min');
});

// ---------- sueño ----------
test('sueño entre semana: 6:00 y meta 7 h 30 → acostarse 22:30', () => {
  const s = newState();
  const i = sleepInfo(s.settings, 1);
  assert.equal(i.bed, H('22:30'));
  assert.equal(i.windStart, H('22:00'));
});
test('sueño de fin de semana: 7:00 → 23:30', () => {
  const s = newState();
  assert.equal(sleepInfo(s.settings, 5).bed, H('23:30'));
});
test('acostarse después de medianoche', () => {
  const s = newState();
  s.settings.wake = H('08:00');
  const i = sleepInfo(s.settings, 2);
  assert.equal(i.bed, 1440 + 30);
  const blocks = sleepBlocks(s.settings, 3);
  assert.equal(blocks[0].start, 30); // se durmió 00:30
  assert.equal(blocks[0].end, H('08:00'));
});

// ---------- huecos ----------
test('freeGaps encuentra huecos entre bloques', () => {
  const gaps = freeGaps([{ start: 60, end: 120 }, { start: 180, end: 240 }], 0, 300);
  assert.deepEqual(gaps, [{ start: 0, end: 60 }, { start: 120, end: 180 }, { start: 240, end: 300 }]);
});

// ---------- motor ----------
test('usa tiempo libre si existe (hoy 17:00–17:30 libre para 30 min)', () => {
  const s = demo();
  const p = propose(s, { title: 'Llamar al banco', area: 'casa', priority: 'media', duration: 30, due: TUE }, { key: TUE, min: H('14:20') });
  assert.ok(p.ok);
  assert.equal(p.kind, 'free');
  assert.equal(p.slot.key, TUE);
  assert.equal(p.slot.start, H('17:00'));
});

test('súper hoy, 1 h, alta, sin tiempo libre → usa el colchón flexible', () => {
  const s = demo();
  const p = propose(s, { title: 'Ir al súper', area: 'casa', priority: 'alta', duration: 60, due: TUE }, { key: TUE, min: H('14:20') });
  assert.ok(p.ok, p.reason);
  assert.equal(p.kind, 'bump');
  // aprovecha la media hora libre de las 17:00 y el colchón de las 17:30
  assert.ok(p.slot.start >= H('17:00') && p.slot.end <= H('19:00'));
  assert.ok(p.changes.some((c) => c.type === 'use'));
  assert.ok(!p.changes.some((c) => c.type === 'move'));
  assert.ok(p.alt, 'debe ofrecer otra opción después de hoy');
});

test('súper 3 h hoy → mueve parte de Productos (media) a otro día y nunca toca a la novia', () => {
  const s = demo();
  const p = propose(s, { title: 'Súper grande', area: 'casa', priority: 'alta', duration: 180, due: TUE }, { key: TUE, min: H('14:20') });
  assert.ok(p.ok, p.reason);
  const today = p.days[TUE];
  const novia = today.find((b) => b.title === 'Novia');
  assert.equal(novia.start, H('19:00'));
  assert.equal(novia.end, H('22:00'));
  // no se pisa nada
  const sorted = today.slice().sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i++) assert.ok(sorted[i].start >= sorted[i - 1].end, 'bloques encimados');
  // el súper está antes de dormir y después de ahora
  assert.ok(p.slot.start >= H('14:25') && p.slot.end <= H('22:00'));
  assert.ok(p.changes.some((c) => c.type === 'move' && c.title.startsWith('Productos')));
});

test('una tarea Media no puede mover cosas Media ni Alta', () => {
  const s = demo();
  // llenar todo el tiempo libre de hoy con bloques de prioridad media
  const p = propose(s, { title: 'Algo', area: 'casa', priority: 'media', duration: 300, due: TUE }, { key: TUE, min: H('14:20') });
  assert.equal(p.ok, false);
});

test('Flexible nunca mueve nada', () => {
  const s = demo();
  const p = propose(s, { title: 'Relleno', area: 'casa', priority: 'flexible', duration: 240, due: TUE }, { key: TUE, min: H('14:20') });
  assert.equal(p.ok, false);
});

test('hora exacta: cita el jueves a las 15:00 (fijo) mueve Productos y lo reubica', () => {
  const s = demo();
  const THU = '2026-10-08';
  const p = propose(s, { title: 'Dentista', area: 'personal', priority: 'fijo', duration: 60, due: THU, at: H('15:00') }, { key: TUE, min: H('10:00') });
  assert.ok(p.ok, p.reason);
  assert.equal(p.kind, 'fixed');
  assert.equal(p.slot.start, H('15:00'));
  const moved = p.changes.find((c) => c.type === 'move');
  assert.ok(moved, 'debe mover la hora de Productos');
  assert.equal(moved.from.start, H('15:00'));
});

test('hora exacta encima de algo Fijo → busca otra hora y lo explica', () => {
  const s = demo();
  const p = propose(s, { title: 'Reunión', area: 'personal', priority: 'alta', duration: 60, due: TUE, at: H('20:00') }, { key: TUE, min: H('10:00') });
  assert.ok(p.ok);
  assert.ok(p.note && p.note.includes('Novia'));
  assert.notEqual(p.slot.start, H('20:00'));
});

test('aplicar una propuesta guarda el día y la tarea queda agendada', () => {
  const s = demo();
  s.tasks.push({ id: 't1', title: 'Ir al súper', area: 'casa', priority: 'alta', duration: 60, due: TUE });
  const p = propose(s, { ...s.tasks[0] }, { key: TUE, min: H('14:20') });
  applyProposal(s, p, TUE);
  assert.equal(s.tasks.length, 0);
  assert.ok(dayBlocks(s, TUE).some((b) => b.title === 'Ir al súper'));
  // la plantilla no cambia
  assert.ok(!s.template[1].some((b) => b.title === 'Ir al súper'));
});

test('un bloque movido 2 veces sube a Alta', () => {
  const s = demo();
  s.plan[TUE] = dayBlocks(s, TUE).map((b) => (b.title.startsWith('Productos') ? { ...b, moves: 1 } : { ...b }));
  const p = propose(s, { title: 'Súper grande', area: 'casa', priority: 'alta', duration: 180, due: TUE }, { key: TUE, min: H('14:20') });
  const moved = p.changes.find((c) => c.type === 'move');
  assert.ok(moved, JSON.stringify(p.changes));
  assert.equal(moved.promoted, true);
});

// ---------- frases ----------
test('parseDuration', () => {
  assert.equal(parseDuration('me toma como una hora'), 60);
  assert.equal(parseDuration('media hora'), 30);
  assert.equal(parseDuration('hora y media'), 90);
  assert.equal(parseDuration('2 horas'), 120);
  assert.equal(parseDuration('45 minutos'), 45);
  assert.equal(parseDuration('una hora y 20 minutos'), 80);
});
test('parseTime', () => {
  assert.equal(parseTime('a las 3'), H('15:00'));
  assert.equal(parseTime('a las 8 de la manana'), H('08:00'));
  assert.equal(parseTime('a las 7:30 de la noche'), H('19:30'));
  assert.equal(parseTime('a las 10'), H('10:00'));
});
test('parseDate', () => {
  assert.equal(parseDate('hoy', TUE), TUE);
  assert.equal(parseDate('manana', TUE), '2026-10-07');
  assert.equal(parseDate('en la manana', TUE), null);
  assert.equal(parseDate('manana por la manana', TUE), '2026-10-07');
  assert.equal(parseDate('el sabado', TUE), '2026-10-10');
  assert.equal(parseDate('el martes', TUE), '2026-10-13');
});
test('frase del súper', () => {
  const r = parseTask('Tengo que ir al súper hoy, no hay comida. Me toma como una hora.', TUE);
  assert.equal(r.title, 'Ir al súper');
  assert.equal(r.duration, 60);
  assert.equal(r.due, TUE);
  assert.equal(r.priority, 'alta');
  assert.equal(r.area, 'casa');
});
test('frase con cita a hora fija', () => {
  const r = parseTask('Cita con el odontólogo el jueves a las 3 de la tarde, dura una hora', TUE);
  assert.equal(r.title, 'Cita con el odontólogo');
  assert.equal(r.due, '2026-10-08');
  assert.equal(r.at, H('15:00'));
  assert.equal(r.priority, 'fijo');
});
test('frase de baja prioridad', () => {
  const r = parseTask('Ordenar el escritorio cuando pueda, media hora', TUE);
  assert.equal(r.priority, 'baja');
  assert.equal(r.duration, 30);
  assert.equal(r.title, 'Ordenar el escritorio cuando pueda');
});
test('frase de video', () => {
  const r = parseTask('Necesito grabar el video de trascendencia mañana, 2 horas', TUE);
  assert.equal(r.area, 'tras');
  assert.equal(r.duration, 120);
  assert.equal(r.due, '2026-10-07');
  assert.equal(r.title, 'Grabar el video de trascendencia');
});

// ---------- repeticiones ----------
test('parseRepeat', () => {
  assert.deepEqual(parseRepeat('todos los domingos tengo partido de futbol'), [6]);
  assert.deepEqual(parseRepeat('los lunes y miercoles gimnasio'), [0, 2]);
  assert.deepEqual(parseRepeat('de lunes a viernes'), [0, 1, 2, 3, 4]);
  assert.deepEqual(parseRepeat('entre semana'), [0, 1, 2, 3, 4]);
  assert.deepEqual(parseRepeat('los fines de semana'), [5, 6]);
  assert.deepEqual(parseRepeat('todos los dias'), [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(parseRepeat('el jueves dentista'), null);
});
test('todos los domingos partido de fútbol', () => {
  const r = parseTask('Todos los domingos tengo partido de fútbol', TUE);
  assert.deepEqual(r.repeat, [6]);
  assert.equal(r.title, 'Partido de fútbol');
  assert.equal(r.area, 'futbol');
  assert.equal(r.priority, 'fijo');
  assert.equal(r.duration, 120);
  assert.equal(r.at, null);
  assert.equal(r.due, null);
});
test('los lunes y miércoles gimnasio a las 6 de la mañana', () => {
  const r = parseTask('Los lunes y miércoles tengo gimnasio a las 6 de la mañana', TUE);
  assert.deepEqual(r.repeat, [0, 2]);
  assert.equal(r.title, 'Gimnasio');
  assert.equal(r.at, H('06:00'));
});

// ---------- varias tareas ----------
test('una sola tarea con frases de apoyo no se parte', () => {
  const t = splitTasks('Tengo que ir al súper hoy, no hay comida. Me toma como una hora.');
  assert.equal(t.length, 1);
});
test('"pan y leche" no se parte, "comprar y llamar" sí', () => {
  assert.equal(splitTasks('comprar pan y leche').length, 1);
  assert.equal(splitTasks('comprar pan y llamar a mi mamá').length, 2);
});
test('varias tareas: heredan la fecha y respetan la suya', () => {
  const r = parseTasks('Mañana tengo que ir al banco y comprar pan y leche, y el viernes dentista a las 3', TUE);
  assert.equal(r.length, 3);
  assert.deepEqual(r.map((x) => x.title), ['Ir al banco', 'Comprar pan y leche', 'Dentista']);
  assert.equal(r[0].due, '2026-10-07');
  assert.equal(r[1].due, '2026-10-07');
  assert.equal(r[2].due, '2026-10-09');
  assert.equal(r[2].at, H('15:00'));
});
test('tareas sueltas y una repetida en la misma frase', () => {
  const r = parseTasks('Hoy tengo que llamar al banco. Todos los domingos tengo partido de fútbol', TUE);
  assert.equal(r.length, 2);
  assert.equal(r[0].due, TUE);
  assert.deepEqual(r[1].repeat, [6]);
});

test('addRecurring: fútbol los domingos sin hora → primer hueco desde las 8:00', () => {
  const s = demo();
  const r = parseTask('Todos los domingos tengo partido de fútbol', TUE);
  const res = addRecurring(s, r, r.repeat, { key: TUE, min: H('14:20') });
  assert.equal(res.added.length, 1);
  assert.equal(res.guessed, true);
  assert.equal(res.added[0].start, H('08:00'));
  assert.ok(s.template[6].some((b) => b.title === 'Partido de fútbol' && b.priority === 'fijo' && b.end - b.start === 120));
});
test('addRecurring: choca con algo Fijo → no lo pisa y lo dice', () => {
  const s = demo();
  const res = addRecurring(s, { title: 'Otro', area: 'futbol', priority: 'fijo', duration: 60, at: H('08:30') }, [5], { key: TUE, min: 0 });
  assert.equal(res.added.length, 0);
  assert.match(res.skipped[0].reason, /Fútbol/);
});
test('addRecurring: recorta lo de menor prioridad y lo avisa', () => {
  const s = demo();
  const res = addRecurring(s, { title: 'Reunión', area: 'personal', priority: 'fijo', duration: 60, at: H('17:30') }, [0], { key: TUE, min: 0 });
  assert.equal(res.added.length, 1);
  assert.equal(res.cut[0].title, 'Colchón: lo que surgió');
  assert.ok(!s.template[0].some((b) => b.title.startsWith('Colchón')));
});
test('addRecurring: también llega a días futuros que ya tenían cambios propios', () => {
  const s = demo();
  const SUN = '2026-10-11';
  s.plan[SUN] = dayBlocks(s, SUN).map((b) => ({ ...b }));
  addRecurring(s, { title: 'Partido de fútbol', area: 'futbol', priority: 'fijo', duration: 120, at: H('09:00') }, [6], { key: TUE, min: H('14:20') });
  assert.ok(s.plan[SUN].some((b) => b.title === 'Partido de fútbol'));
});

console.log(`${passed} pruebas pasaron${process.exitCode ? ' (con fallas arriba)' : ''}`);
