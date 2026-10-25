import { AUDIO } from '../config';

export type SoundName =
  | 'pistol'
  | 'rifle'
  | 'dryFire'
  | 'reloadStart'
  | 'reloadEnd'
  | 'switch'
  | 'hit'
  | 'kill'
  | 'headshot'
  | 'playerHurt';

/** Sounds that come from a point in the world and are panned/attenuated in 3D. */
export type PositionalSoundName = 'groan' | 'zombieAttack' | 'zombieHit' | 'zombieDeath';

/** All sounds are synthesized with WebAudio: oscillators plus a cached white-noise buffer. */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private noise!: AudioBuffer;
  private voiceEnds: number[] = [];

  /** Must be called from a user gesture (browsers block audio until then). */
  unlock(): void {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = AUDIO.master;
      this.master.connect(this.ctx.destination);
      this.sfx = this.ctx.createGain();
      this.sfx.gain.value = AUDIO.sfx;
      this.sfx.connect(this.master);

      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setVolumes(master: number, sfx: number): void {
    if (!this.ctx) return;
    this.master.gain.value = master;
    this.sfx.gain.value = sfx;
  }

  /** Places the listener at the camera, facing `forward`. */
  setListener(x: number, y: number, z: number, fx: number, fy: number, fz: number): void {
    const l = this.ctx?.listener;
    if (!l) return;
    if (l.positionX) {
      l.positionX.value = x;
      l.positionY.value = y;
      l.positionZ.value = z;
      l.forwardX.value = fx;
      l.forwardY.value = fy;
      l.forwardZ.value = fz;
      l.upX.value = 0;
      l.upY.value = 1;
      l.upZ.value = 0;
    } else {
      l.setPosition(x, y, z);
      l.setOrientation(fx, fy, fz, 0, 1, 0);
    }
  }

  play(name: SoundName): void {
    const now = this.claimVoice();
    if (now < 0) return;
    const out = this.sfx;

    let duration = 0;
    switch (name) {
      case 'pistol':
        duration = this.gunshot(now, out, 2200, 0.13, 190, 0.85);
        break;
      case 'rifle':
        duration = this.gunshot(now, out, 1500, 0.17, 140, 1.0);
        break;
      case 'dryFire':
        duration = this.tone(now, out, 'square', 2400, 2400, 0.015, 0.15);
        break;
      case 'reloadStart':
        this.noiseBurst(now, out, 'highpass', 3000, 0.03, 0.35);
        duration = this.noiseBurst(now + 0.09, out, 'bandpass', 1800, 0.04, 0.3) + 0.09;
        break;
      case 'reloadEnd':
        this.noiseBurst(now, out, 'bandpass', 2600, 0.05, 0.45);
        duration = this.noiseBurst(now + 0.1, out, 'bandpass', 1600, 0.06, 0.5) + 0.1;
        break;
      case 'switch':
        duration = this.noiseBurst(now, out, 'bandpass', 2000, 0.04, 0.25);
        break;
      case 'hit':
        duration = this.tone(now, out, 'triangle', 1900, 1700, 0.045, 0.3);
        break;
      case 'kill':
        this.tone(now, out, 'sine', 880, 820, 0.14, 0.35);
        duration = this.tone(now, out, 'sine', 1320, 1240, 0.14, 0.2);
        break;
      case 'headshot':
        this.tone(now, out, 'sine', 2640, 2600, 0.35, 0.3);
        duration = this.tone(now, out, 'sine', 3960, 3900, 0.25, 0.12);
        break;
      case 'playerHurt':
        this.tone(now, out, 'sine', 140, 60, 0.18, 0.8);
        duration = this.noiseBurst(now, out, 'lowpass', 900, 0.15, 0.5);
        break;
    }
    this.voiceEnds.push(now + duration);
  }

  /** `pitch` scales the voice (each zombie gets its own). */
  playAt(name: PositionalSoundName, x: number, y: number, z: number, pitch = 1): void {
    const now = this.claimVoice();
    if (now < 0) return;
    const ctx = this.ctx!;
    const panner = ctx.createPanner();
    panner.panningModel = 'equalpower';
    panner.distanceModel = 'inverse';
    panner.refDistance = 3;
    panner.maxDistance = 60;
    panner.rolloffFactor = 1.2;
    if (panner.positionX) {
      panner.positionX.value = x;
      panner.positionY.value = y;
      panner.positionZ.value = z;
    } else {
      panner.setPosition(x, y, z);
    }
    panner.connect(this.sfx);

    let duration = 0;
    switch (name) {
      case 'groan':
        duration = this.groan(now, panner, 85 * pitch, 0.9 + Math.random() * 0.6, 0.85, 0.35);
        break;
      case 'zombieAttack':
        this.groan(now, panner, 130 * pitch, 0.35, 1.3, 0.45);
        duration = this.noiseBurst(now + 0.25, panner, 'bandpass', 1200, 0.12, 0.35) + 0.25;
        break;
      case 'zombieHit':
        this.noiseBurst(now, panner, 'lowpass', 700, 0.1, 0.6);
        duration = this.tone(now, panner, 'sine', 110, 60, 0.1, 0.5);
        break;
      case 'zombieDeath':
        duration = this.groan(now, panner, 110 * pitch, 1.1, 0.45, 0.45);
        break;
    }
    this.voiceEnds.push(now + duration);
    window.setTimeout(() => panner.disconnect(), (duration + 0.2) * 1000);
  }

  /** Returns the current audio time, or -1 when audio is unavailable or the voice cap is hit. */
  private claimVoice(): number {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return -1;
    const now = ctx.currentTime;
    this.voiceEnds = this.voiceEnds.filter((t) => t > now);
    return this.voiceEnds.length >= AUDIO.maxVoices ? -1 : now;
  }

  /** Noise crack + filtered body + low thump. Returns duration. */
  private gunshot(t: number, out: AudioNode, filterFreq: number, decay: number, thumpFreq: number, gain: number): number {
    this.noiseBurst(t, out, 'highpass', 4000, 0.025, 0.5 * gain);
    this.noiseBurst(t, out, 'lowpass', filterFreq, decay, 0.9 * gain);
    this.tone(t, out, 'sine', thumpFreq, 45, decay * 0.8, 0.9 * gain);
    return decay + 0.05;
  }

  /** Two detuned saws with vibrato through a resonant lowpass. `bend` < 1 slides the pitch down. */
  private groan(t: number, out: AudioNode, freq: number, duration: number, bend: number, peak: number): number {
    const ctx = this.ctx!;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq * 7;
    filter.Q.value = 4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.15);
    g.gain.setValueAtTime(peak, t + duration * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    filter.connect(g).connect(out);

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5 + Math.random() * 3;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = freq * 0.06;
    lfo.connect(lfoGain);

    for (const detune of [1, 1.013]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq * detune, t);
      osc.frequency.exponentialRampToValueAtTime(freq * detune * bend, t + duration);
      lfoGain.connect(osc.frequency);
      osc.connect(filter);
      osc.start(t);
      osc.stop(t + duration + 0.02);
    }
    lfo.start(t);
    lfo.stop(t + duration + 0.02);
    return duration;
  }

  private noiseBurst(t: number, out: AudioNode, type: BiquadFilterType, freq: number, decay: number, peak: number): number {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = type === 'bandpass' ? 1.2 : 0.7;
    const g = ctx.createGain();
    this.envelope(g, t, peak, decay);
    src.connect(filter).connect(g).connect(out);
    // Random offset into the buffer so repeated shots don't sound identical.
    src.start(t, Math.random() * 0.5);
    src.stop(t + decay + 0.02);
    return decay;
  }

  private tone(t: number, out: AudioNode, type: OscillatorType, from: number, to: number, decay: number, peak: number): number {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + decay);
    const g = ctx.createGain();
    this.envelope(g, t, peak, decay);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + decay + 0.02);
    return decay;
  }

  private envelope(g: GainNode, t: number, peak: number, decay: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  }
}
