// Secretaria con IA: Gemini escucha el audio y devuelve las tareas ya entendidas.
// La clave se guarda solo en este dispositivo (no va en el respaldo ni en el código).
import { toMin, longDate, fmt } from './time.js';

const KEY = 'rumbo.gemini';
const MODEL = 'gemini-flash-latest';
const PRIOS = ['fijo', 'alta', 'media', 'baja', 'flexible'];

export function getKey() {
  try {
    return localStorage.getItem(KEY) || '';
  } catch (e) {
    return '';
  }
}
export function setKey(k) {
  try {
    if (k) localStorage.setItem(KEY, k.trim());
    else localStorage.removeItem(KEY);
  } catch (e) { /* sin almacenamiento */ }
}

export function buildPrompt({ today, nowMin, areas }) {
  return `Eres la secretaria de la app Rumbo. Hoy es ${longDate(today)} (${today}) y son las ${fmt(nowMin)}.
Escucha el audio (español de Colombia). Transcríbelo y saca TODAS las tareas o compromisos que la persona menciona.

Responde SOLO con JSON, así:
{"transcripcion": "texto exacto", "tareas": [{"titulo": "...", "duracion_min": 60, "fecha": "AAAA-MM-DD", "hora": "HH:MM", "prioridad": "media", "area": "casa", "repetir": []}]}

Reglas:
- titulo: corto, empieza con verbo o sustantivo ("Ir al súper", "Partido de fútbol"), sin la fecha ni la hora.
- duracion_min: la que diga; si no dice, estima algo razonable (súper 60, dentista 60, partido de fútbol 120).
- fecha: "hoy" = ${today}; "mañana" = el día siguiente; "el viernes" = el próximo viernes. null si no dice día.
- hora: solo si dice una hora exacta, en 24 h ("a las 3" de la tarde = "15:00"). Si no, null.
- repetir: si es algo que se repite ("todos los domingos", "los lunes y miércoles", "entre semana"), lista de días con 0 = lunes … 6 = domingo, y fecha null. Si no se repite, [].
- prioridad: "fijo" para citas, clases, partidos y todo lo que se repite; "alta" si es urgente o importante ("no hay comida", "sin falta"); "baja" si dice "cuando pueda"; si no, "media".
- area: el id más parecido de esta lista: ${areas.map((a) => `${a.id} (${a.name})`).join(', ')}. Si ninguno encaja, "personal".
- Si el audio no tiene ninguna tarea (ruido, saludo), "tareas": [].`;
}

function cleanJson(text) {
  return String(text || '').replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
}

// Convierte la respuesta de Gemini en tareas con el mismo formato que parseTask()
export function parseGemini(text, today, areaIds) {
  let obj;
  try {
    obj = JSON.parse(cleanJson(text));
  } catch (e) {
    return null;
  }
  const list = Array.isArray(obj.tareas) ? obj.tareas : [];
  const tasks = list.map((t) => {
    const repeat = Array.isArray(t.repetir) && t.repetir.length
      ? [...new Set(t.repetir.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))].sort((a, b) => a - b)
      : null;
    const area = areaIds.includes(t.area) ? t.area : 'personal';
    const at = /^\d{1,2}:\d{2}$/.test(t.hora || '') ? toMin(t.hora) : null;
    let due = /^\d{4}-\d{2}-\d{2}$/.test(t.fecha || '') ? t.fecha : null;
    if (due && due < today) due = today;
    const dur = Number(t.duracion_min) > 0 ? Math.min(600, Math.round(Number(t.duracion_min))) : repeat && area === 'futbol' ? 120 : 60;
    return {
      title: String(t.titulo || '').trim().slice(0, 80),
      duration: dur,
      due: repeat && repeat.length ? null : due,
      at,
      priority: PRIOS.includes(t.prioridad) ? t.prioridad : 'media',
      area,
      repeat: repeat && repeat.length ? repeat : null,
    };
  }).filter((t) => t.title);
  return { transcript: String(obj.transcripcion || ''), tasks };
}

// Manda el audio (WAV en base64) y devuelve { transcript, tasks }
export async function understandAudio(b64, ctx) {
  const key = getKey();
  if (!key) throw new Error('sin-clave');
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ inline_data: { mime_type: 'audio/wav', data: b64 } }, { text: buildPrompt(ctx) }] }],
      generationConfig: { response_mime_type: 'application/json', temperature: 0.1 },
    }),
  });
  if (!res.ok) {
    const err = new Error(res.status === 429 ? 'cupo' : res.status === 400 || res.status === 403 ? 'clave' : 'servidor');
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
  const out = parseGemini(text, ctx.today, ctx.areas.map((a) => a.id));
  if (!out) throw new Error('respuesta');
  return out;
}
