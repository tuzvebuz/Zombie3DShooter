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
  | 'headshot';

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

  play(name: SoundName): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    this.voiceEnds = this.voiceEnds.filter((t) => t > now);
    if (this.voiceEnds.length >= AUDIO.maxVoices) return;

    let duration = 0;
    switch (name) {
      case 'pistol':
        duration = this.gunshot(now, 2200, 0.13, 190, 0.85);
        break;
      case 'rifle':
        duration = this.gunshot(now, 1500, 0.17, 140, 1.0);
        break;
      case 'dryFire':
        duration = this.tone(now, 'square', 2400, 2400, 0.015, 0.15);
        break;
      case 'reloadStart':
        this.noiseBurst(now, 'highpass', 3000, 0.03, 0.35);
        duration = this.noiseBurst(now + 0.09, 'bandpass', 1800, 0.04, 0.3) + 0.09;
        break;
      case 'reloadEnd':
        this.noiseBurst(now, 'bandpass', 2600, 0.05, 0.45);
        duration = this.noiseBurst(now + 0.1, 'bandpass', 1600, 0.06, 0.5) + 0.1;
        break;
      case 'switch':
        duration = this.noiseBurst(now, 'bandpass', 2000, 0.04, 0.25);
        break;
      case 'hit':
        duration = this.tone(now, 'triangle', 1900, 1700, 0.045, 0.3);
        break;
      case 'kill':
        this.tone(now, 'sine', 880, 820, 0.14, 0.35);
        duration = this.tone(now, 'sine', 1320, 1240, 0.14, 0.2);
        break;
      case 'headshot':
        this.tone(now, 'sine', 2640, 2600, 0.35, 0.3);
        duration = this.tone(now, 'sine', 3960, 3900, 0.25, 0.12);
        break;
    }
    this.voiceEnds.push(now + duration);
  }

  /** Noise crack + filtered body + low thump. Returns duration. */
  private gunshot(t: number, filterFreq: number, decay: number, thumpFreq: number, gain: number): number {
    this.noiseBurst(t, 'highpass', 4000, 0.025, 0.5 * gain);
    this.noiseBurst(t, 'lowpass', filterFreq, decay, 0.9 * gain);
    this.tone(t, 'sine', thumpFreq, 45, decay * 0.8, 0.9 * gain);
    return decay + 0.05;
  }

  private noiseBurst(t: number, type: BiquadFilterType, freq: number, decay: number, peak: number): number {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = type === 'bandpass' ? 1.2 : 0.7;
    const g = ctx.createGain();
    this.envelope(g, t, peak, decay);
    src.connect(filter).connect(g).connect(this.sfx);
    // Random offset into the buffer so repeated shots don't sound identical.
    src.start(t, Math.random() * 0.5);
    src.stop(t + decay + 0.02);
    return decay;
  }

  private tone(t: number, type: OscillatorType, from: number, to: number, decay: number, peak: number): number {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + decay);
    const g = ctx.createGain();
    this.envelope(g, t, peak, decay);
    osc.connect(g).connect(this.sfx);
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
