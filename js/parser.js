// Entiende frases en español como "tengo que ir al súper hoy, no hay comida, me toma una hora"
// y saca: título, duración, fecha, hora exacta, prioridad y área.
// Es una versión sin IA (reglas). En la Fase 2 la reemplaza Gemini, con la misma salida.
import { addDays, weekday } from './time.js';

const NUM = {
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  once: 11, doce: 12, quince: 15, veinte: 20, treinta: 30, cuarenta: 40, cuarenta_y_cinco: 45, cincuenta: 50,
};
const WEEKDAYS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];

const AREA_WORDS = [
  ['casa', /\b(super|supermercado|mercado|compras?|comprar|tienda|farmacia|banco|pagar|factura|lavar|limpiar|arreglar|cocinar|droguer[ií]a|recibo)\b/],
  ['uni', /\b(universidad|clase|clases|parcial|examen|quiz|taller|tarea de|moodle|profe|profesor|exposici[oó]n|unisim[oó]n|trabajo de)\b/],
  ['tras', /\b(trascendencia|espiritual|conocimiento prohibido|hotmart|libro)\b/],
  ['web', /\bwebnaria\b/],
  ['afil', /\bafiliad[oa]s?\b/],
  ['prod', /\b(producto|productos|velora|maquillaje|calzado|zapatos|perfume|perfumes|bodega|inventario|plataforma)\b/],
  ['futbol', /\b(f[uú]tbol|partido|entreno|entrenamiento|cancha)\b/],
  ['novia', /\b(novia|mi amor)\b/],
];

const strip = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function wordNum(w) {
  if (/^\d+$/.test(w)) return Number(w);
  return NUM[w];
}

export function parseDuration(t) {
  // t ya viene sin tildes y en minúsculas
  if (/\bhora y media\b/.test(t)) {
    const m = t.match(/\b(\d+|un|una|dos|tres|cuatro|cinco)\s+horas? y media\b/);
    return ((m ? wordNum(m[1]) : 1) * 60) + 30;
  }
  if (/\bmedia hora\b/.test(t)) return 30;
  if (/\bun cuarto de hora\b/.test(t)) return 15;
  let total = 0;
  const h = t.match(/\b(\d+(?:[.,]\d+)?|un|una|dos|tres|cuatro|cinco|seis|siete|ocho)\s*(?:horas?|hrs?|h)\b/);
  if (h) total += Math.round(parseFloat(String(wordNum(h[1]) ?? h[1]).replace(',', '.')) * 60);
  const m = t.match(/\b(\d+|cinco|diez|quince|veinte|treinta|cuarenta|cincuenta)\s*(?:minutos?|mins?|m)\b/);
  if (m) total += wordNum(m[1]);
  return total || null;
}

export function parseTime(t) {
  // "a las 3", "a las 3:30", "a las 5 de la tarde", "a las 8 am", "a las 15:00", "al mediodia"
  if (/\b(al )?mediodia\b/.test(t)) return 12 * 60;
  const m = t.match(/\ba las? (\d{1,2})(?:[:.](\d{2}))?\s*(am|a\.m\.|pm|p\.m\.|de la manana|de la tarde|de la noche)?/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] || 0);
  const q = m[3] || '';
  if (/pm|p\.m\.|tarde|noche/.test(q) && h < 12) h += 12;
  else if (/am|a\.m\.|manana/.test(q) && h === 12) h = 0;
  else if (!q && h >= 1 && h <= 6) h += 12; // "a las 3" casi siempre es de la tarde
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function parseDate(t, today) {
  if (/\bpasado manana\b/.test(t)) return addDays(today, 2);
  if (/\bhoy\b|\besta (tarde|noche)\b|\bahora\b|\bya mismo\b/.test(t)) return today;
  // "mañana" como día, sin contar "en/por/de la mañana" (parte del día)
  if (/\bmanana\b/.test(t.replace(/\b(en|por|de) la manana\b/g, ''))) return addDays(today, 1);
  const wd = t.match(/\b(el |este |el proximo |para el )?(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/);
  if (wd) {
    const target = WEEKDAYS.indexOf(wd[2]);
    let diff = (target - weekday(today) + 7) % 7;
    if (diff === 0) diff = 7;
    return addDays(today, diff);
  }
  if (/\b(esta semana|antes del domingo)\b/.test(t)) return addDays(today, 6 - weekday(today));
  return null;
}

export function parsePriority(t, hasTime) {
  if (/\b(cuando pueda|si hay tiempo|si me da tiempo|algun dia|no es urgente|sin afan|cuando tenga tiempo)\b/.test(t)) return 'baja';
  if (hasTime && /\b(cita|reunion|medico|odontologo|dentista|examen|parcial|vuelo|entrevista|clase|partido|entreno)\b/.test(t)) return 'fijo';
  if (/\b(urgente|importante|sin falta|obligatori[oa]|no hay|se acabo|se me acabo|ya mismo|prioridad|no puedo olvidar|no se me puede olvidar)\b/.test(t)) return 'alta';
  if (hasTime) return 'alta';
  return 'media';
}

export function parseArea(t) {
  for (const [id, re] of AREA_WORDS) if (re.test(t)) return id;
  return 'personal';
}

const FILLERS = /^(oye|hola|bueno|entonces|por favor|porfa|recuerdame|recuerda|anota|agenda|agendame|ponme|pon|tengo que|necesito|debo|hay que|me toca|quiero|quisiera|me gustaria|toca|voy a|tendria que|tengo|tenemos|y|tambi[eé]n|adem[aá]s|luego|despu[eé]s)\s+/i;

const WD_ACC = '(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bados?|domingos?)';
const REPEAT_PHRASES = new RegExp(
  `\\b(?:(?:todos|todas) los|cada|los)\\s+${WD_ACC}(?:\\s*(?:,|y)\\s*(?:los\\s+)?${WD_ACC})*|\\bde ${WD_ACC} a ${WD_ACC}|\\b(?:todos los d[ií]as|cada d[ií]a|a diario|diariamente|entre semana|(?:los )?fines? de semana|d[ií]as (?:de semana|laborales|h[aá]biles))`, 'gi');

function stripFillers(s) {
  for (let i = 0; i < 4; i++) s = s.replace(FILLERS, '').trim();
  return s;
}

export function parseTitle(original) {
  // Primera idea de la frase (hasta el primer punto o coma)
  let s = original.split(/[.,;\n]| porque | ya que /i)[0].trim();
  s = stripFillers(s);
  s = s
    .replace(REPEAT_PHRASES, '')
    .replace(/\ba las? \d{1,2}([:.]\d{2})?\s*(am|pm|de la mañana|de la manana|de la tarde|de la noche)?/gi, '')
    .replace(/\b(por|en|de) la (mañana|manana|tarde|noche)\b/gi, '')
    .replace(/\b(pasado mañana|pasado manana|mañana|manana|hoy|esta semana|esta tarde|esta noche|ya mismo|ahora)\b/gi, '')
    .replace(/\b(el |este |el próximo |el proximo |para el )?(lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo)\b/gi, '')
    .replace(/\b(me toma|me demoro|me demora|me tardo|dura|como|unos|unas|durante)\b.*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  s = stripFillers(s);
  if (!s) s = original.trim().slice(0, 60);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------- repeticiones: "todos los domingos", "lunes y miércoles", "entre semana" ----------
const WD_RE = '(lunes|martes|miercoles|jueves|viernes|sabados?|domingos?)';
const WD_IDX = { lunes: 0, martes: 1, miercoles: 2, jueves: 3, viernes: 4, sabado: 5, sabados: 5, domingo: 6, domingos: 6 };

export function parseRepeat(t) {
  if (/\b(todos los dias|cada dia|a diario|diariamente)\b/.test(t)) return [0, 1, 2, 3, 4, 5, 6];
  const range = t.match(new RegExp(`\\bde ${WD_RE} a ${WD_RE}\\b`));
  if (range) {
    const a = WD_IDX[range[1]];
    const b = WD_IDX[range[2]];
    const out = [];
    for (let i = a; out.length < 7; i = (i + 1) % 7) {
      out.push(i);
      if (i === b) break;
    }
    return out;
  }
  if (/\b(entre semana|dias de semana|dias laborales|dias habiles)\b/.test(t)) return [0, 1, 2, 3, 4];
  if (/\b(fines? de semana|sabados y domingos)\b/.test(t)) return [5, 6];
  const trig = t.match(new RegExp(`\\b(?:todos los|todas los|cada|los)\\s+${WD_RE}`));
  if (trig) {
    const days = new Set();
    for (const m of t.slice(trig.index).matchAll(new RegExp(`\\b${WD_RE}\\b`, 'g'))) days.add(WD_IDX[m[1]]);
    return [...days].sort((a, b) => a - b);
  }
  return null;
}

// ---------- varias tareas en una frase ----------
const VERBS = /^(ir|comprar|llamar|pagar|hacer|grabar|enviar|mandar|revisar|terminar|preparar|lavar|limpiar|buscar|recoger|entregar|estudiar|escribir|editar|subir|cocinar|arreglar|organizar|sacar|reunirme|visitar|ver|practicar|entrenar|jugar|agendar|cambiar|reservar|cancelar|pedir|devolver|cargar|renovar|actualizar|publicar|armar|disenar|probar|configurar|empezar|iniciar|avanzar|responder|contestar|programar|cortarme|bañarme|banarme|tomar|llevar|traer|ayudar|hablar|quedar|salir|viajar|descansar|dormir|leer|cobrar|imprimir|rellenar|montar|crear|instalar|desarrollar)\b/;
const MARKERS = /^(tengo que|necesito|debo|hay que|me toca|quiero|quisiera|tambien|ademas|luego|despues|recuerdame|anota|agenda|agendame|ponme|pon|todos los|todas los|cada|hoy|manana|pasado manana)\b/;
const MODIFIER = /^(me toma|me demoro|me demora|me tardo|dura|como|unos|unas|son|es|no hay|no tengo|porque|ya que|pero|aunque|que sea|si puedes)\b/;
const strip2 = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

function startsTask(piece) {
  const t = strip2(piece);
  if (!t) return false;
  if (MARKERS.test(t) || VERBS.test(t)) return true;
  return new RegExp(`^el ${WD_RE}\\s+\\S`).test(t); // "el viernes dentista"
}

// Devuelve [{ text, soft }]: soft = se separó con "y" o coma (hereda la fecha de la anterior)
export function splitTasks(text) {
  const parts = String(text).split(/([.;\n]+|,|\s+y\s+|\s+(?:además|ademas|también|tambien|luego|después|despues)\s+)/i);
  const out = [];
  let pendingHard = false;
  let sepText = '';
  for (let i = 0; i < parts.length; i += 2) {
    const piece = parts[i] || '';
    const sep = i > 0 ? parts[i - 1] : '';
    if (!piece.trim()) {
      if (sep) {
        sepText += sep;
        if (/[.;\n]/.test(sep)) pendingHard = true;
      }
      continue;
    }
    if (!out.length) {
      out.push({ text: piece.trim(), soft: false });
    } else {
      const hard = pendingHard || /[.;\n]/.test(sep);
      const isNew = hard ? !MODIFIER.test(strip2(piece)) : startsTask(piece);
      if (isNew) out.push({ text: piece.trim(), soft: !hard });
      else out[out.length - 1].text += `${sepText || sep}${piece}`;
    }
    pendingHard = false;
    sepText = '';
  }
  return out;
}

export function parseTask(text, today) {
  const t = strip(text);
  const at = parseTime(t);
  const duration = parseDuration(t);
  const repeat = parseRepeat(t);
  const area = parseArea(t);
  let priority = parsePriority(t, at != null);
  if (repeat && priority !== 'baja') priority = 'fijo'; // un compromiso que se repite no se mueve
  return {
    title: parseTitle(text),
    duration: duration || (repeat && area === 'futbol' ? 120 : 60),
    durationGuessed: !duration,
    due: repeat ? null : parseDate(t, today),
    at,
    priority,
    area,
    repeat,
  };
}

// Todas las tareas de una frase. Las que van unidas con "y" heredan la fecha de la anterior
// ("mañana tengo que ir al banco y comprar pan" → las dos para mañana).
export function parseTasks(text, today) {
  const out = [];
  for (const piece of splitTasks(text)) {
    const task = parseTask(piece.text, today);
    const prev = out[out.length - 1];
    if (piece.soft && prev && !prev.repeat && !task.repeat && !task.due && task.at == null && prev.due) task.due = prev.due;
    out.push(task);
  }
  return out;
}
