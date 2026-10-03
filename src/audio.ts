/**
 * Web Audio synth. The engine is a sawtooth whose pitch follows the
 * speed; events are short envelopes. Everything is made here, no files.
 */
class Audio {
  private ctx: AudioContext | null = null;
  private engine: { osc: OscillatorNode; gain: GainNode; filter: BiquadFilterNode } | null = null;
  muted = false;

  constructor() {
    try {
      this.muted = localStorage.getItem('sora.muted') === '1';
    } catch {
      /* fine */
    }
  }

  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    try {
      this.ctx = new AudioContext();
    } catch {
      this.ctx = null;
    }
  }

  setMuted(m: boolean): void {
    this.muted = m;
    try {
      localStorage.setItem('sora.muted', m ? '1' : '0');
    } catch {
      /* fine */
    }
    if (this.engine) this.engine.gain.gain.value = m ? 0 : 0.05;
  }

  startEngine(): void {
    if (!this.ctx || this.engine) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 600;
    const gain = this.ctx.createGain();
    gain.gain.value = this.muted ? 0 : 0.05;
    osc.connect(filter).connect(gain).connect(this.ctx.destination);
    osc.start();
    this.engine = { osc, gain, filter };
  }

  /** speed 0..1 of the top, throttle 0..1 */
  engineAt(speed: number, slip: number): void {
    if (!this.engine || !this.ctx) return;
    const f = 55 + speed * 190 + Math.abs(slip) * 6;
    this.engine.osc.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.05);
    this.engine.filter.frequency.setTargetAtTime(400 + speed * 900, this.ctx.currentTime, 0.05);
  }

  stopEngine(): void {
    if (!this.engine) return;
    this.engine.osc.stop();
    this.engine.osc.disconnect();
    this.engine = null;
  }

  play(name: string): void {
    if (!this.ctx || this.muted) return;
    const c = this.ctx;
    const t = c.currentTime;
    const beep = (f: number, at: number, len: number, type: OscillatorType = 'square', vol = 0.12) => {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type;
      o.frequency.value = f;
      g.gain.setValueAtTime(vol, t + at);
      g.gain.exponentialRampToValueAtTime(0.001, t + at + len);
      o.connect(g).connect(c.destination);
      o.start(t + at);
      o.stop(t + at + len);
    };
    switch (name) {
      case 'count':
        beep(440, 0, 0.15);
        break;
      case 'go':
        beep(880, 0, 0.4);
        break;
      case 'lap':
        beep(660, 0, 0.1);
        beep(880, 0.1, 0.18);
        break;
      case 'finish':
        beep(660, 0, 0.12);
        beep(880, 0.12, 0.12);
        beep(1100, 0.24, 0.35);
        break;
      case 'gun':
        beep(1400 + Math.random() * 400, 0, 0.05, 'square', 0.07);
        break;
      case 'missile': {
        const o = c.createOscillator();
        const g = c.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(900, t);
        o.frequency.exponentialRampToValueAtTime(200, t + 0.35);
        g.gain.setValueAtTime(0.18, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
        o.connect(g).connect(c.destination);
        o.start(t);
        o.stop(t + 0.4);
        break;
      }
      case 'mine':
        beep(260, 0, 0.12, 'square', 0.12);
        break;
      case 'boom':
      case 'wreck': {
        const len = name === 'wreck' ? 0.9 : 0.5;
        const buf = c.createBuffer(1, c.sampleRate * len, c.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
        const src = c.createBufferSource();
        src.buffer = buf;
        const f = c.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.setValueAtTime(1200, t);
        f.frequency.exponentialRampToValueAtTime(100, t + len);
        const g = c.createGain();
        g.gain.value = name === 'wreck' ? 0.7 : 0.5;
        src.connect(f).connect(g).connect(c.destination);
        src.start(t);
        break;
      }
      case 'crunch': {
        const len = 0.25;
        const buf = c.createBuffer(1, c.sampleRate * len, c.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
        const src = c.createBufferSource();
        src.buffer = buf;
        const g = c.createGain();
        g.gain.value = 0.4;
        src.connect(g).connect(c.destination);
        src.start(t);
        break;
      }
      case 'nitro':
        beep(300, 0, 0.3, 'sawtooth', 0.12);
        beep(600, 0.05, 0.35, 'sawtooth', 0.1);
        break;
      case 'cash':
        beep(1320, 0, 0.08, 'square', 0.1);
        beep(1760, 0.08, 0.14, 'square', 0.1);
        break;
      case 'pickup':
        beep(880, 0, 0.08, 'triangle', 0.14);
        beep(1100, 0.07, 0.12, 'triangle', 0.14);
        break;
      case 'respawn':
        beep(440, 0, 0.1, 'triangle', 0.12);
        beep(660, 0.1, 0.1, 'triangle', 0.12);
        beep(880, 0.2, 0.2, 'triangle', 0.12);
        break;
      case 'spin':
        beep(300, 0, 0.1, 'square', 0.1);
        beep(240, 0.1, 0.1, 'square', 0.1);
        beep(180, 0.2, 0.2, 'square', 0.1);
        break;
      case 'bump':
        beep(90, 0, 0.12, 'triangle', 0.3);
        break;
      case 'land':
        // the springs bottoming out: a low thud and a knock
        beep(70, 0, 0.18, 'triangle', 0.35);
        beep(140, 0.02, 0.06, 'square', 0.08);
        break;
      case 'splash': {
        // a hiss of water: noise through a band that falls
        const len = 0.35;
        const buf = c.createBuffer(1, c.sampleRate * len, c.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
        const src = c.createBufferSource();
        src.buffer = buf;
        const f = c.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.setValueAtTime(2400, t);
        f.frequency.exponentialRampToValueAtTime(700, t + len);
        const g = c.createGain();
        g.gain.value = 0.25;
        src.connect(f).connect(g).connect(c.destination);
        src.start(t);
        break;
      }
      case 'hit': {
        const o = c.createOscillator();
        const g = c.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(140, t);
        o.frequency.exponentialRampToValueAtTime(40, t + 0.25);
        g.gain.setValueAtTime(0.25, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        o.connect(g).connect(c.destination);
        o.start(t);
        o.stop(t + 0.3);
        break;
      }
    }
  }
}

export const audio = new Audio();
