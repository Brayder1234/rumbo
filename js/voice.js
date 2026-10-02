// Micrófono "manos libres": escucha sin parar y corta el audio en frases cuando haces una pausa.
// Cada frase se entrega como audio WAV de 16 kHz (formato que Gemini acepta).

// Separa frases por silencio. Es puro (sin navegador) para poder probarlo con node.
export class Segmenter {
  constructor(sampleRate, opts = {}) {
    this.rate = sampleRate;
    this.pauseMs = opts.pauseMs ?? 1600;   // silencio que cierra una frase
    this.minSpeechMs = opts.minSpeechMs ?? 400;
    this.maxMs = opts.maxMs ?? 25000;      // una frase muy larga se corta igual
    this.prerollMs = opts.prerollMs ?? 300;
    this.floor = 0.005;                    // ruido de fondo (se ajusta solo)
    this.reset();
    this.preroll = [];
  }

  reset() {
    this.speaking = false;
    this.chunks = [];
    this.speechMs = 0;
    this.silenceMs = 0;
    this.totalMs = 0;
  }

  // frame: Float32Array de muestras. Devuelve las frases que se cerraron con este pedazo.
  push(frame) {
    const out = [];
    let sum = 0;
    for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
    const rms = Math.sqrt(sum / frame.length);
    const ms = (frame.length / this.rate) * 1000;
    const threshold = Math.max(0.012, this.floor * 3);
    const loud = rms > threshold;
    if (!loud) this.floor = this.floor * 0.95 + rms * 0.05;

    if (!this.speaking) {
      this.preroll.push(frame);
      let pre = this.preroll.reduce((a, f) => a + f.length, 0);
      while (this.preroll.length > 1 && (pre - this.preroll[0].length) / this.rate * 1000 >= this.prerollMs) {
        pre -= this.preroll[0].length;
        this.preroll.shift();
      }
      if (loud) {
        this.speaking = true;
        this.chunks = this.preroll.slice();
        this.preroll = [];
        this.speechMs = ms;
        this.totalMs = this.chunks.reduce((a, f) => a + f.length, 0) / this.rate * 1000;
      }
      return out;
    }

    this.chunks.push(frame);
    this.totalMs += ms;
    if (loud) {
      this.speechMs += ms;
      this.silenceMs = 0;
    } else {
      this.silenceMs += ms;
    }
    if (this.silenceMs >= this.pauseMs || this.totalMs >= this.maxMs) {
      const seg = this.take();
      if (seg) out.push(seg);
    }
    return out;
  }

  // Cierra lo que se estaba diciendo (al tocar "terminar")
  flush() {
    const seg = this.speaking ? this.take() : null;
    return seg ? [seg] : [];
  }

  take() {
    const keep = this.speechMs >= this.minSpeechMs;
    const len = this.chunks.reduce((a, f) => a + f.length, 0);
    const all = new Float32Array(len);
    let o = 0;
    for (const f of this.chunks) {
      all.set(f, o);
      o += f.length;
    }
    this.reset();
    return keep ? all : null;
  }
}

// Float32 (cualquier frecuencia) → WAV mono 16 bits a 16 kHz
export function encodeWav(samples, inRate, outRate = 16000) {
  const ratio = inRate / outRate;
  const n = Math.floor(samples.length / ratio);
  const pcm = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * ratio);
    const b = Math.min(samples.length, Math.floor((i + 1) * ratio));
    let s = 0;
    for (let j = a; j < b; j++) s += samples[j];
    const v = Math.max(-1, Math.min(1, s / Math.max(1, b - a)));
    pcm[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
  }
  const buf = new ArrayBuffer(44 + pcm.length * 2);
  const dv = new DataView(buf);
  const str = (o, t) => { for (let i = 0; i < t.length; i++) dv.setUint8(o + i, t.charCodeAt(i)); };
  str(0, 'RIFF');
  dv.setUint32(4, 36 + pcm.length * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, 1, true);
  dv.setUint32(24, outRate, true);
  dv.setUint32(28, outRate * 2, true);
  dv.setUint16(32, 2, true);
  dv.setUint16(34, 16, true);
  str(36, 'data');
  dv.setUint32(40, pcm.length * 2, true);
  new Int16Array(buf, 44).set(pcm);
  return new Uint8Array(buf);
}

export function toBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// Abre el micrófono y llama onSegment(samples, sampleRate) por cada frase.
export async function startMic(onSegment) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
  const C = window.AudioContext || window.webkitAudioContext;
  const ctx = new C();
  await ctx.resume();
  const src = ctx.createMediaStreamSource(stream);
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  const seg = new Segmenter(ctx.sampleRate);
  proc.onaudioprocess = (e) => {
    const data = new Float32Array(e.inputBuffer.getChannelData(0));
    for (const s of seg.push(data)) onSegment(s, ctx.sampleRate);
  };
  src.connect(proc);
  proc.connect(ctx.destination); // la salida va en silencio; es necesario para que procese
  return {
    stop() {
      for (const s of seg.flush()) onSegment(s, ctx.sampleRate);
      try {
        proc.disconnect();
        src.disconnect();
      } catch (e) { /* ya cerrado */ }
      stream.getTracks().forEach((t) => t.stop());
      ctx.close();
    },
  };
}
