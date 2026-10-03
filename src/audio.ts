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
      case 'bump':
        beep(90, 0, 0.12, 'triangle', 0.3);
        break;
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
