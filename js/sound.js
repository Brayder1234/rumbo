// Tonos de alarma generados con Web Audio (no necesitan archivos).
// En el iPhone el audio solo arranca después de un toque, por eso unlock() se llama en el primer toque.

export const TONES = [
  { id: 'radar', name: 'Radar', desc: 'Intenso, como despertador' },
  { id: 'clasico', name: 'Despertador clásico', desc: 'Pitidos rápidos' },
  { id: 'campanas', name: 'Campanas', desc: 'Más suave' },
  { id: 'pulso', name: 'Pulso', desc: 'Grave y lento' },
];

const PATTERNS = {
  radar: { type: 'square', notes: [1046, 880, 1046, 880, 1046, 880], step: 0.22, len: 0.18, vol: 0.12 },
  clasico: { type: 'square', notes: [2000, 2000, 2000, 2000, 0, 2000, 2000, 2000, 2000], step: 0.11, len: 0.07, vol: 0.08 },
  campanas: { type: 'sine', notes: [1318, 1046, 880, 1046, 1318], step: 0.3, len: 0.6, vol: 0.25 },
  pulso: { type: 'sine', notes: [523, 0, 523, 0, 523], step: 0.35, len: 0.25, vol: 0.3 },
};

let ctx = null;

function context() {
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function unlock() {
  try {
    const c = context();
    if (!c) return;
    // Un sonido mudo para que iOS deje sonar los siguientes
    const o = c.createOscillator();
    const g = c.createGain();
    g.gain.value = 0;
    o.connect(g);
    g.connect(c.destination);
    o.start();
    o.stop(c.currentTime + 0.01);
  } catch (e) { /* sin audio */ }
}

// Toca el tono una vez. Devuelve cuánto dura (segundos).
export function play(id = 'radar', volume = 1) {
  const p = PATTERNS[id] || PATTERNS.radar;
  try {
    const c = context();
    if (!c) return 0;
    const t0 = c.currentTime + 0.05;
    p.notes.forEach((f, i) => {
      if (!f) return;
      const o = c.createOscillator();
      const g = c.createGain();
      const t = t0 + i * p.step;
      o.type = p.type;
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(p.vol * volume, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + p.len);
      o.connect(g);
      g.connect(c.destination);
      o.start(t);
      o.stop(t + p.len + 0.02);
    });
  } catch (e) {
    return 0;
  }
  return p.notes.length * p.step + p.len;
}

// Repite el tono hasta que se llame stop()
let loop = null;
export function startLoop(id) {
  stopLoop();
  const once = () => {
    const secs = play(id);
    loop = setTimeout(once, Math.max(1.2, secs + 0.8) * 1000);
  };
  once();
  if (navigator.vibrate) navigator.vibrate([400, 200, 400, 200, 400]);
}

export function stopLoop() {
  clearTimeout(loop);
  loop = null;
}
