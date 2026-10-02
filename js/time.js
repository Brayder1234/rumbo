// Utilidades de fecha y hora. Los minutos se cuentan desde la medianoche (0–1440).
// Las fechas se guardan como texto 'AAAA-MM-DD' en hora local.

export const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
export const DAYS_SHORT = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'];
export const DAYS_PLURAL = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados', 'domingos'];
export const DAYS_LETTER = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
export const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export const pad = (n) => String(n).padStart(2, '0');

// '06:30' → 390
export function toMin(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

// 390 → '6:30'; 1440 → '24:00'
export function fmt(min) {
  const m = Math.round(min);
  const h = Math.floor(m / 60);
  return `${h}:${pad(m % 60)}`;
}

// 390 → '06:30' (para <input type="time">)
export function fmtInput(min) {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

// 90 → '1 h 30 min'
export function dur(min) {
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

export function dateKey(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key, n) {
  const d = fromKey(key);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}

// Lunes = 0 … Domingo = 6
export function weekday(key) {
  return (fromKey(key).getDay() + 6) % 7;
}

export function weekStart(key) {
  return addDays(key, -weekday(key));
}

export function diffDays(a, b) {
  return Math.round((fromKey(b) - fromKey(a)) / 86400000);
}

export function nowMin(d = new Date()) {
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
}

export const roundUp = (min, step = 5) => Math.ceil(min / step) * step;

// 'Martes 6 de octubre'
export function longDate(key) {
  const d = fromKey(key);
  return `${DAYS[weekday(key)]} ${d.getDate()} de ${MONTHS[d.getMonth()]}`;
}

// 'hoy', 'mañana', 'el sábado', 'el 14 de octubre'
export function relDay(key, today) {
  const n = diffDays(today, key);
  if (n === 0) return 'hoy';
  if (n === 1) return 'mañana';
  if (n === -1) return 'ayer';
  if (n > 1 && n < 7) return `el ${DAYS[weekday(key)].toLowerCase()}`;
  const d = fromKey(key);
  return `el ${d.getDate()} de ${MONTHS[d.getMonth()]}`;
}

export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);

// [6] → 'todos los domingos'; [0,2] → 'los lunes y miércoles'; [0..4] → 'entre semana'
export function repeatLabel(days) {
  const d = [...days].sort((a, b) => a - b);
  if (d.length === 7) return 'todos los días';
  if (d.join() === '0,1,2,3,4') return 'entre semana';
  if (d.join() === '5,6') return 'los fines de semana';
  const names = d.map((i) => DAYS_PLURAL[i]);
  if (names.length === 1) return `todos los ${names[0]}`;
  return `los ${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
}
