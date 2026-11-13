type BbSoundChannel = "fx" | "crowd";
type BbCrowdMoment = "hit" | "run" | "homer" | "out";
type BbSynthName = "release" | "mitt" | "whiff" | "crackGood" | "crackWeak" | "tick" | "glove" | "throw" | "slide" | "cheer" | "homer" | "groan" | "rhythm" | "bell" | "jingle" | "timer" | "bed";

interface BbSoundPrefs {
  fx: boolean;
  crowd: boolean;
  volume: number;
}

class BbSoundSettings {
  private static readonly KEY = "baseballduel_sound_v1";
  static readonly VOLUMES: readonly number[] = [1, 0.6, 0.3];
  static readonly VOLUME_LABELS: readonly string[] = ["음량: 크게", "음량: 보통", "음량: 작게"];

  static load(): BbSoundPrefs {
    try {
      const raw = localStorage.getItem(BbSoundSettings.KEY), saved = raw ? JSON.parse(raw) as Partial<BbSoundPrefs> : {};
      const volume = BbSoundSettings.VOLUMES.indexOf(Number(saved.volume)) >= 0 ? Number(saved.volume) : BbSoundSettings.VOLUMES[1];
      return { fx: saved.fx !== false, crowd: saved.crowd !== false, volume };
    } catch (error) {
      return { fx: true, crowd: true, volume: BbSoundSettings.VOLUMES[1] };
    }
  }

  static save(prefs: BbSoundPrefs): void {
    try { localStorage.setItem(BbSoundSettings.KEY, JSON.stringify(prefs)); } catch (error) { return; }
  }
}

class BbNoise {
  private state: number;

  constructor(seed: number) { this.state = seed >>> 0 || 1; }

  next(): number {
    this.state = (this.state * 1664525 + 1013904223) >>> 0;
    return this.state / 2147483648 - 1;
  }
}

class BbBandPass {
  private low = 0;
  private band = 0;

  step(input: number, frequency: number, resonance: number, rate: number): number {
    const tune = 2 * Math.sin(Math.PI * Math.min(frequency, rate / 6) / rate);
    this.low += tune * this.band;
    const high = input - this.low - resonance * this.band;
    this.band += tune * high;
    return this.band;
  }

  lowOut(): number { return this.low; }
}

class BbSynthBank {
  static readonly RATE = 22050;
  private readonly noise = new BbNoise(4141);
  private readonly made = new Map<BbSynthName, Float32Array>();

  build(): ReadonlyMap<BbSynthName, Float32Array> {
    if (this.made.size) return this.made;
    this.made.set("release", this.sweep(0.25, 700, 2600, 0.5, 0.7));
    this.made.set("throw", this.sweep(0.18, 600, 2000, 0.6, 0.5));
    this.made.set("whiff", this.sweep(0.22, 260, 1300, 0.8, 0.6));
    this.made.set("mitt", this.pop(0.14, 105, 0.9));
    this.made.set("glove", this.pop(0.1, 170, 0.6));
    this.made.set("crackGood", this.crack(0.16, [1250, 2650, 3900], 0.035, 1));
    this.made.set("crackWeak", this.crack(0.12, [460, 900], 0.02, 0.7));
    this.made.set("tick", this.crack(0.07, [1500, 3100], 0.012, 0.45));
    this.made.set("slide", this.scrape(0.5));
    this.made.set("cheer", this.roar(2, 520, 980, 0.55, 10));
    this.made.set("homer", this.mix(this.roar(4, 560, 1150, 0.75, 26), this.fanfare([523.25, 659.25, 783.99], 0.18, 0.3), 0.1));
    this.made.set("groan", this.groan(1.4));
    this.made.set("rhythm", this.claps([0, 0.3, 0.75, 0.95, 1.15], 1.6));
    this.made.set("bell", this.bell(0.8, 1320));
    this.made.set("jingle", this.fanfare([392, 523.25, 659.25], 0.12, 0.25));
    this.made.set("timer", this.beep(0.06, 1000, 0.35));
    this.made.set("bed", this.bed(6));
    this.made.forEach((samples, name) => BbSynthBank.limit(samples, name === "bed" ? BbSynthBank.BED_PEAK : BbSynthBank.PEAK));
    return this.made;
  }

  private static readonly PEAK = 0.95;
  private static readonly BED_PEAK = 0.5;

  private static limit(samples: Float32Array, peak: number): void {
    let loudest = 0;
    for (let index = 0; index < samples.length; index++) loudest = Math.max(loudest, Math.abs(samples[index]));
    if (loudest <= peak) return;
    const scale = peak / loudest;
    for (let index = 0; index < samples.length; index++) samples[index] *= scale;
  }

  private length(seconds: number): Float32Array { return new Float32Array(Math.floor(seconds * BbSynthBank.RATE)); }

  private sweep(seconds: number, from: number, to: number, resonance: number, gain: number): Float32Array {
    const out = this.length(seconds), filter = new BbBandPass();
    for (let index = 0; index < out.length; index++) {
      const ratio = index / out.length, envelope = Math.sin(Math.PI * Math.pow(ratio, 0.6));
      out[index] = filter.step(this.noise.next(), from + (to - from) * ratio, resonance, BbSynthBank.RATE) * envelope * gain * 2.2;
    }
    return out;
  }

  private pop(seconds: number, tone: number, gain: number): Float32Array {
    const out = this.length(seconds), filter = new BbBandPass(), rate = BbSynthBank.RATE;
    for (let index = 0; index < out.length; index++) {
      const time = index / rate, burst = time < 0.03 ? Math.exp(-time * 120) : 0;
      out[index] = (filter.step(this.noise.next() * burst, 1800, 1, rate) * 1.4 + Math.sin(2 * Math.PI * tone * time) * Math.exp(-time * 28)) * gain;
    }
    return out;
  }

  private crack(seconds: number, partials: readonly number[], decay: number, gain: number): Float32Array {
    const out = this.length(seconds), rate = BbSynthBank.RATE;
    for (let index = 0; index < out.length; index++) {
      const time = index / rate, click = index < 22 ? (1 - index / 22) * this.noise.next() : 0;
      let ring = 0;
      partials.forEach((tone, order) => { ring += Math.sin(2 * Math.PI * tone * time) * Math.exp(-time / (decay / (order + 1))) / (order + 1); });
      out[index] = (click * 0.9 + ring * 0.8) * gain;
    }
    return out;
  }

  private scrape(seconds: number): Float32Array {
    const out = this.length(seconds), filter = new BbBandPass();
    for (let index = 0; index < out.length; index++) {
      const ratio = index / out.length;
      filter.step(this.noise.next(), 900 - ratio * 500, 0.9, BbSynthBank.RATE);
      out[index] = filter.lowOut() * Math.sin(Math.PI * Math.min(1, ratio * 1.6)) * 0.7;
    }
    return out;
  }

  private roar(seconds: number, from: number, to: number, gain: number, clapCount: number): Float32Array {
    const out = this.length(seconds), filters = [new BbBandPass(), new BbBandPass()], rate = BbSynthBank.RATE;
    for (let index = 0; index < out.length; index++) {
      const ratio = index / out.length, rise = Math.min(1, ratio * 6), fall = Math.min(1, (1 - ratio) * 2.5), center = from + (to - from) * Math.min(1, ratio * 3);
      const voice = filters[0].step(this.noise.next(), center, 1.2, rate) + filters[1].step(this.noise.next(), center * 1.9, 1.4, rate) * 0.5;
      out[index] = voice * rise * fall * gain * 1.8;
    }
    for (let clap = 0; clap < clapCount; clap++) this.addClap(out, Math.floor((0.15 + (clap * 0.618) % 1 * 0.8) * out.length), 0.18);
    return out;
  }

  private groan(seconds: number): Float32Array {
    const out = this.length(seconds), filter = new BbBandPass();
    for (let index = 0; index < out.length; index++) {
      const ratio = index / out.length;
      filter.step(this.noise.next(), 900 - ratio * 650, 0.6, BbSynthBank.RATE);
      out[index] = filter.lowOut() * Math.min(1, ratio * 8) * (1 - ratio) * 0.9;
    }
    return out;
  }

  private claps(times: readonly number[], seconds: number): Float32Array {
    const out = this.length(seconds);
    times.forEach((time) => { for (let hand = 0; hand < 7; hand++) this.addClap(out, Math.floor((time + hand * 0.006) * BbSynthBank.RATE), 0.22); });
    return out;
  }

  private addClap(out: Float32Array, start: number, gain: number): void {
    const span = Math.floor(0.05 * BbSynthBank.RATE), filter = new BbBandPass();
    for (let offset = 0; offset < span && start + offset < out.length; offset++) out[start + offset] += filter.step(this.noise.next(), 1600, 0.7, BbSynthBank.RATE) * Math.exp(-offset / span * 6) * gain * 3;
  }

  private bell(seconds: number, tone: number): Float32Array {
    const out = this.length(seconds), rate = BbSynthBank.RATE;
    for (let index = 0; index < out.length; index++) {
      const time = index / rate;
      out[index] = (Math.sin(2 * Math.PI * tone * time) + Math.sin(2 * Math.PI * tone * 2.01 * time) * 0.4 + Math.sin(2 * Math.PI * tone * 3.02 * time) * 0.15) * Math.exp(-time * 5) * 0.35;
    }
    return out;
  }

  private fanfare(tones: readonly number[], noteSeconds: number, gain: number): Float32Array {
    const out = this.length(noteSeconds * (tones.length + 1.5)), rate = BbSynthBank.RATE;
    tones.forEach((tone, order) => {
      const start = Math.floor(order * noteSeconds * rate), span = Math.floor((order === tones.length - 1 ? noteSeconds * 2.5 : noteSeconds) * rate);
      for (let offset = 0; offset < span && start + offset < out.length; offset++) {
        const time = offset / rate, square = Math.sin(2 * Math.PI * tone * time) >= 0 ? 1 : -1;
        out[start + offset] += square * gain * Math.min(1, offset / 120) * Math.max(0, 1 - offset / span);
      }
    });
    return out;
  }

  private beep(seconds: number, tone: number, gain: number): Float32Array {
    const out = this.length(seconds), rate = BbSynthBank.RATE;
    for (let index = 0; index < out.length; index++) out[index] = Math.sin(2 * Math.PI * tone * index / rate) * gain * Math.min(1, (out.length - index) / 200);
    return out;
  }

  private bed(seconds: number): Float32Array {
    const out = this.length(seconds), filter = new BbBandPass(), rate = BbSynthBank.RATE;
    let pink = 0;
    for (let index = 0; index < out.length; index++) {
      pink = pink * 0.97 + this.noise.next() * 0.03;
      filter.step(pink, 420, 0.8, rate);
      out[index] = filter.lowOut() * (0.75 + 0.25 * Math.sin(2 * Math.PI * index / out.length)) * 9;
    }
    const fade = Math.floor(0.05 * rate);
    for (let index = 0; index < fade; index++) out[out.length - fade + index] = BbCurve.mix(out[out.length - fade + index], out[index], index / fade);
    return out;
  }

  private mix(base: Float32Array, overlay: Float32Array, atSeconds: number): Float32Array {
    const start = Math.floor(atSeconds * BbSynthBank.RATE);
    for (let index = 0; index < overlay.length && start + index < base.length; index++) base[start + index] += overlay[index];
    return base;
  }
}

class BbSoundCue {
  private constructor(readonly channel: BbSoundChannel, private samples: Float32Array | null, private readonly url: string | null) {}

  static synth(channel: BbSoundChannel, samples: Float32Array): BbSoundCue { return new BbSoundCue(channel, samples, null); }

  static file(channel: BbSoundChannel, url: string): BbSoundCue { return new BbSoundCue(channel, null, url); }

  private buffer: AudioBuffer | null = null;

  async prepare(context: AudioContext): Promise<void> {
    if (this.buffer) return;
    if (this.url) { this.buffer = await context.decodeAudioData(await (await fetch(this.url)).arrayBuffer()); return; }
    const samples = this.samples as Float32Array, buffer = context.createBuffer(1, samples.length, BbSynthBank.RATE);
    buffer.getChannelData(0).set(samples);
    this.buffer = buffer;
    this.samples = null;
  }

  get ready(): AudioBuffer | null { return this.buffer; }
}

class BbAudioMixer {
  private static readonly VOICES = 8;
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly channels = new Map<BbSoundChannel, GainNode>();
  private playing = 0;
  private bedSource: AudioBufferSourceNode | null = null;
  private bedGain: GainNode | null = null;

  constructor(private readonly cues: ReadonlyMap<BbSynthName, BbSoundCue>, private prefs: BbSoundPrefs) {
    const wake = () => { this.wake(); };
    ["pointerdown", "keydown", "touchstart"].forEach((name) => window.addEventListener(name, wake, { passive: true }));
  }

  private wake(): void {
    if (this.context) { if (this.context.state === "suspended") this.context.resume().catch(() => undefined); return; }
    const Context = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return;
    const context = new Context(), master = context.createGain();
    master.connect(context.destination);
    this.context = context;
    this.master = master;
    (["fx", "crowd"] as BbSoundChannel[]).forEach((channel) => { const gain = context.createGain(); gain.connect(master); this.channels.set(channel, gain); });
    this.apply(this.prefs);
    Promise.all(Array.from(this.cues.values()).map((cue) => cue.prepare(context))).then(() => this.startBed()).catch(() => undefined);
  }

  apply(prefs: BbSoundPrefs): void {
    this.prefs = prefs;
    if (!this.master) return;
    this.master.gain.value = prefs.volume;
    (this.channels.get("fx") as GainNode).gain.value = prefs.fx ? 1 : 0;
    (this.channels.get("crowd") as GainNode).gain.value = prefs.crowd ? 1 : 0;
  }

  play(name: BbSynthName, volume: number, rate = 1): void {
    const context = this.context, cue = this.cues.get(name), buffer = cue ? cue.ready : null;
    if (!context || !cue || !buffer || context.state !== "running" || this.playing >= BbAudioMixer.VOICES || volume <= 0.01) return;
    if (!(cue.channel === "fx" ? this.prefs.fx : this.prefs.crowd)) return;
    const source = context.createBufferSource(), gain = context.createGain();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    gain.gain.value = volume;
    source.connect(gain).connect(this.channels.get(cue.channel) as GainNode);
    this.playing++;
    source.onended = () => { this.playing--; gain.disconnect(); };
    source.start();
  }

  swell(level: number): void {
    const context = this.context, gain = this.bedGain;
    if (context && gain) gain.gain.setTargetAtTime(level, context.currentTime, 0.6);
  }

  private startBed(): void {
    const context = this.context, cue = this.cues.get("bed"), buffer = cue ? cue.ready : null;
    if (!context || !buffer || this.bedSource) return;
    const source = context.createBufferSource(), gain = context.createGain();
    source.buffer = buffer;
    source.loop = true;
    gain.gain.value = 0.35;
    source.connect(gain).connect(this.channels.get("crowd") as GainNode);
    source.start();
    this.bedSource = source;
    this.bedGain = gain;
  }
}

class BbCrowdVoice {
  private static readonly CALM = 0.35;
  private static readonly TENSE = 0.55;
  private static readonly RHYTHM_GAP = 2.2;
  private tense = false;
  private rhythmIn = 0;

  constructor(private readonly mixer: BbAudioMixer) {}

  moment(kind: BbCrowdMoment): void {
    if (kind === "homer") { this.mixer.play("homer", 1); this.mixer.swell(0.8); }
    else if (kind === "run") { this.mixer.play("bell", 0.7); this.mixer.play("cheer", 0.9); this.mixer.swell(0.6); }
    else if (kind === "hit") { this.mixer.play("cheer", 0.75); this.mixer.swell(0.55); }
    else { this.mixer.play("cheer", 0.35, 1.08); this.mixer.play("groan", 0.55); }
  }

  tension(on: boolean): void {
    if (on === this.tense) return;
    this.tense = on;
    this.rhythmIn = 0;
    this.mixer.swell(on ? BbCrowdVoice.TENSE : BbCrowdVoice.CALM);
  }

  settle(): void { this.mixer.swell(this.tense ? BbCrowdVoice.TENSE : BbCrowdVoice.CALM); }

  tick(frameSeconds: number): void {
    if (!this.tense) return;
    this.rhythmIn -= frameSeconds;
    if (this.rhythmIn > 0) return;
    this.rhythmIn = BbCrowdVoice.RHYTHM_GAP;
    this.mixer.play("rhythm", 0.7);
  }
}

interface BbCrowdStand {
  cheer(moment: BbCrowdMoment, batting: 0 | 1): void;
  tension(on: boolean): void;
}

class BbAtmosphere {
  private tense = false;

  constructor(private readonly stand: BbCrowdStand, private readonly sound: BbSoundDirector) {}

  mark(mark: BbSoundMark): void { this.sound.mark(mark); }

  moment(kind: BbCrowdMoment, batting: 0 | 1): void {
    this.stand.cheer(kind, batting);
    this.sound.moment(kind);
  }

  tension(on: boolean): void {
    if (on === this.tense) return;
    this.tense = on;
    this.stand.tension(on);
    this.sound.tension(on);
  }

  swap(): void {
    this.tension(false);
    this.sound.swap();
  }

  clockTick(): void { this.sound.clockTick(); }

  tick(frameSeconds: number): void { this.sound.tick(frameSeconds); }
}

class BbSoundDirector {
  private static readonly HEARING_METERS = 18;
  private readonly mixer: BbAudioMixer;
  private readonly crowd: BbCrowdVoice;
  private prefs = BbSoundSettings.load();

  constructor(private readonly listener: () => BbVec | null) {
    const cues = new Map<BbSynthName, BbSoundCue>(), crowdNames: BbSynthName[] = ["cheer", "homer", "groan", "rhythm", "bed"];
    new BbSynthBank().build().forEach((samples, name) => cues.set(name, BbSoundCue.synth(crowdNames.indexOf(name) >= 0 ? "crowd" : "fx", samples)));
    this.mixer = new BbAudioMixer(cues, this.prefs);
    this.crowd = new BbCrowdVoice(this.mixer);
  }

  get settings(): BbSoundPrefs { return this.prefs; }

  change(part: Partial<BbSoundPrefs>): void {
    this.prefs = { ...this.prefs, ...part };
    BbSoundSettings.save(this.prefs);
    this.mixer.apply(this.prefs);
  }

  mark(mark: BbSoundMark): void {
    const volume = mark.power * this.nearness(mark.point);
    if (mark.kind === "crack") this.mixer.play(mark.power > 0.6 ? "crackGood" : "crackWeak", Math.max(0.35, volume), 0.94 + mark.power * 0.12);
    else if (mark.kind === "release") this.mixer.play("release", volume, 0.85 + mark.power * 0.35);
    else if (mark.kind === "mitt") this.mixer.play("mitt", Math.max(0.3, volume));
    else this.mixer.play(mark.kind, volume);
  }

  moment(kind: BbCrowdMoment): void { this.crowd.moment(kind); }

  tension(on: boolean): void { this.crowd.tension(on); }

  settle(): void { this.crowd.settle(); }

  swap(): void { this.mixer.play("jingle", 0.6); }

  clockTick(): void { this.mixer.play("timer", 0.6); }

  tick(frameSeconds: number): void { this.crowd.tick(frameSeconds); }

  private nearness(point: BbVec | null): number {
    const ear = this.listener();
    if (!point || !ear) return 1;
    return BbCurve.clamp(BbSoundDirector.HEARING_METERS / Math.max(BbSoundDirector.HEARING_METERS, point.distanceTo(ear)), 0.15, 1);
  }
}
