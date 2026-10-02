// Guarda el estado en este dispositivo (localStorage). Cada cambio se guarda solo.
// Antes de importar o borrar se deja una copia de respaldo.
import { newState, normalize } from './model.js';

const KEY = 'rumbo.v1';
const BACKUP = 'rumbo.v1.respaldo';

export let state = load();

function load() {
  try {
    return normalize(JSON.parse(localStorage.getItem(KEY)));
  } catch (e) {
    return newState();
  }
}

let timer = null;
export function save() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('No se pudo guardar', e);
    }
  }, 150);
}

export function backup() {
  try {
    localStorage.setItem(BACKUP, JSON.stringify(state));
  } catch (e) { /* sin espacio */ }
}

export function replace(next) {
  backup();
  state = normalize(next);
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) { /* sin espacio */ }
}

export function reset() {
  replace(newState());
}

// Deshacer de un paso (para "Deshacer" después de confirmar una propuesta)
let undoCopy = null;
export function snapshot() {
  undoCopy = JSON.stringify(state);
}
export function undo() {
  if (!undoCopy) return false;
  state = normalize(JSON.parse(undoCopy));
  undoCopy = null;
  save();
  return true;
}
export const canUndo = () => !!undoCopy;

export function exportJSON() {
  return JSON.stringify({ app: 'Rumbo', exportado: new Date().toISOString(), datos: state }, null, 2);
}

export function importJSON(text) {
  const obj = JSON.parse(text);
  const data = obj && obj.datos ? obj.datos : obj;
  if (!data || typeof data !== 'object' || !data.template) throw new Error('El archivo no es un respaldo de Rumbo.');
  replace(data);
}
