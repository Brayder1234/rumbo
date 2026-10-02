# Rumbo · Fase 1

Agenda de 24 horas con "secretaria": acomoda lo que te surge según su prioridad, cuida tu sueño y te avisa con alarma.
App web instalable (PWA), sin dependencias ni servidor. Tus datos se guardan solo en el dispositivo.

## Qué hace esta versión

- **Hoy:** tu día en una barra de 24 h, lo que toca ahora, lo que sigue, pendientes y "¿lo cumpliste?".
- **Semana:** las 24 h de cada día. Dos modos: *Esta semana* (cambios solo para esa fecha) y *Plantilla* (tu semana normal, que se copia a cada semana nueva).
- **Secretaria (sin IA todavía):** escribes o dictas "ir al súper hoy, no hay comida, una hora" y entiende la tarea, la duración, la fecha, la hora exacta, la prioridad y el área. El motor busca tiempo libre; si no hay, usa el colchón (Flexible) o mueve cosas de menor prioridad a otro hueco. Nunca toca lo Fijo, lo de igual o más prioridad, ni el sueño. Siempre pide confirmación y se puede deshacer.
- **Prioridades:** Fijo, Alta, Media, Baja y Flexible. Un bloque que se mueve dos veces sube a Alta.
- **Sueño:** la hora de levantarte es fija y la de acostarte se calcula con tu meta; desconexión antes de dormir; registro de noches con promedio y deuda de sueño.
- **Alarmas:** Fijo y Alta suenan en pantalla completa hasta que respondas (Empezar, Posponer 10 min, Moverlo). Media: aviso con sonido. 4 tonos. Notificaciones del sistema si las activas.
- **Revisión:** porcentaje de bloques cumplidos por área y semana.
- **Ajustes:** modo claro/oscuro/automático, tonos, áreas, respaldo (descargar y restaurar).

Límite de la Fase 1: las alarmas suenan mientras Rumbo esté abierto (en la Mac, aunque esté detrás de otras ventanas). Con la app cerrada avisará Telegram en la Fase 2.

## Archivos

- `index.html`, `styles.css`, `manifest.webmanifest`, `sw.js`, `icons/`
- `js/app.js` pantallas y acciones · `js/model.js` datos y sueño · `js/scheduler.js` motor de agenda · `js/parser.js` entiende frases · `js/store.js` guardado · `js/sound.js` tonos · `js/time.js` fechas

## Probar

```bash
node tests/logic.test.mjs
python3 -m http.server 8820
```

Luego abre http://localhost:8820

## Publicar en GitHub Pages

Al cambiar archivos, sube el número de `CACHE` en `sw.js` para que los teléfonos reciban la versión nueva.

## Próximas fases

2. Secretaria con IA (Gemini) y voz, sincronización iPhone ↔ Mac con Cloudflare, avisos por Telegram con la app cerrada.
3. Tablero de videos (Trascendencia y WebNaria).
4. Google Calendar y calendario compartido.
5. Aprendizaje de duraciones reales y sueño desde Salud.
