// Pruebas del micrófono manos libres y de la lectura de respuestas de Gemini.
// Correr con: node tests/voice.test.mjs
import assert from 'node:assert/strict';
import { Segmenter, encodeWav, toBase64 } from '../js/voice.js';
import { parseGemini, buildPrompt } from '../js/gemini.js';

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; } catch (e) { console.error(`✗ ${name}\n  ${e.message}`); process.exitCode = 1; }
}

const RATE = 48000;
const FRAME = 4096;
// genera pedazos de audio: voz = seno de 200 Hz con amplitud 0.2; silencio = ruido muy bajo
function audio(plan) {
  const frames = [];
  let t = 0;
  for (const [kind, secs] of plan) {
    const n = Math.round((secs * RATE) / FRAME);
    for (let i = 0; i < n; i++) {
      const f = new Float32Array(FRAME);
      for (let j = 0; j < FRAME; j++, t++) f[j] = kind === 'voz' ? 0.2 * Math.sin((2 * Math.PI * 200 * t) / RATE) : (Math.random() - 0.5) * 0.002;
      frames.push(f);
    }
  }
  return frames;
}
const run = (plan, seg = new Segmenter(RATE)) => audio(plan).flatMap((f) => seg.push(f));

test('una frase entre silencios → 1 segmento de más o menos su duración', () => {
  const out = run([['silencio', 1], ['voz', 2], ['silencio', 2.5]]);
  assert.equal(out.length, 1);
  const secs = out[0].length / RATE;
  assert.ok(secs > 2 && secs < 4.5, `duró ${secs}`);
});
test('dos frases con pausa larga → 2 segmentos', () => {
  const out = run([['silencio', 0.5], ['voz', 1.5], ['silencio', 2], ['voz', 1], ['silencio', 2]]);
  assert.equal(out.length, 2);
});
test('pausa corta dentro de una frase no la parte', () => {
  const out = run([['silencio', 0.5], ['voz', 1], ['silencio', 0.6], ['voz', 1], ['silencio', 2]]);
  assert.equal(out.length, 1);
});
test('un golpe cortito no cuenta como frase', () => {
  const out = run([['silencio', 1], ['voz', 0.1], ['silencio', 2]]);
  assert.equal(out.length, 0);
});
test('al terminar (flush) entrega lo que se estaba diciendo', () => {
  const seg = new Segmenter(RATE);
  run([['silencio', 0.5], ['voz', 1.5]], seg);
  assert.equal(seg.flush().length, 1);
});
test('WAV de 16 kHz con encabezado correcto', () => {
  const wav = encodeWav(new Float32Array(RATE), RATE); // 1 segundo
  const txt = String.fromCharCode(...wav.slice(0, 4)) + String.fromCharCode(...wav.slice(8, 12));
  assert.equal(txt, 'RIFFWAVE');
  assert.equal(wav.length, 44 + 16000 * 2);
  assert.ok(toBase64(wav).length > 0);
});

const AREAS = ['tras', 'web', 'prod', 'afil', 'uni', 'novia', 'futbol', 'casa', 'personal'];
test('parseGemini: varias tareas, repetición y valores raros', () => {
  const r = parseGemini('```json\n' + JSON.stringify({
    transcripcion: 'todos los domingos partido y mañana súper a las 5',
    tareas: [
      { titulo: 'Partido de fútbol', duracion_min: null, fecha: '2026-10-04', hora: null, prioridad: 'fijo', area: 'futbol', repetir: [6] },
      { titulo: 'Ir al súper', duracion_min: 60, fecha: '2026-10-03', hora: '17:00', prioridad: 'alta', area: 'casa', repetir: [] },
      { titulo: 'Algo', duracion_min: 30, fecha: '2020-01-01', hora: '25:99x', prioridad: 'rarísima', area: 'inventada', repetir: [9] },
      { titulo: '', duracion_min: 30 },
    ],
  }) + '\n```', '2026-10-02', AREAS);
  assert.equal(r.tasks.length, 3);
  assert.deepEqual(r.tasks[0].repeat, [6]);
  assert.equal(r.tasks[0].due, null);
  assert.equal(r.tasks[0].duration, 120);
  assert.equal(r.tasks[1].at, 17 * 60);
  assert.equal(r.tasks[1].due, '2026-10-03');
  assert.equal(r.tasks[2].due, '2026-10-02'); // fecha pasada → hoy
  assert.equal(r.tasks[2].at, null);
  assert.equal(r.tasks[2].priority, 'media');
  assert.equal(r.tasks[2].area, 'personal');
  assert.equal(r.tasks[2].repeat, null);
});
test('parseGemini: respuesta que no es JSON → null', () => {
  assert.equal(parseGemini('lo siento, no entendí', '2026-10-02', AREAS), null);
});
test('el prompt lleva la fecha de hoy y las áreas', () => {
  const p = buildPrompt({ today: '2026-10-02', nowMin: 14 * 60, areas: [{ id: 'casa', name: 'Casa' }] });
  assert.ok(p.includes('2026-10-02') && p.includes('casa (Casa)') && p.includes('14:00'));
});

console.log(`${passed} pruebas pasaron${process.exitCode ? ' (con fallas arriba)' : ''}`);
