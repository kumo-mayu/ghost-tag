// Distance -> sound. A single beep (or pulse burst) whose repeat interval
// shrinks as the oni gets closer (linear interpolation between
// captureDistance and farDistance). Direction is layered on top, speaker
// (mono) compatible: pulse COUNT within a burst = coarse sector
// (front/right/behind/left), lowpass filter brightness = how well the
// player's current heading aligns with the oni (clear = facing it, dull =
// facing away) — see main.js computeDirectionCue(). Stereo panning is a
// separate, optional, headphones-only layer on top of that.
// Footsteps / breathing etc. stay out of scope for the first prototype.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.timer = null;
  }

  // Must be called from a user-gesture handler (e.g. the START button click)
  // so the AudioContext is allowed to run on mobile Chrome.
  init() {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContextClass();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // pan: -1 (full left) .. 0 (center) .. 1 (full right). Ignored on
  // browsers without StereoPannerNode support (falls back to mono).
  // filterHz: optional lowpass cutoff — lower = duller/muffled.
  _beep(freq = 880, durationMs = 90, gain = 0.25, pan = 0, filterHz = null) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;

    osc.connect(g);
    let chainEnd = g;

    if (filterHz != null) {
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = filterHz;
      chainEnd.connect(filter);
      chainEnd = filter;
    }

    if (this.ctx.createStereoPanner) {
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      chainEnd.connect(panner);
      chainEnd = panner;
    }
    chainEnd.connect(this.ctx.destination);

    const now = this.ctx.currentTime;
    g.gain.setValueAtTime(gain, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + durationMs / 1000);
    osc.start(now);
    osc.stop(now + durationMs / 1000 + 0.02);
  }

  // Plays `pulseCount` short pulses back-to-back — a coarse, speaker-safe
  // way to encode a direction sector. `gapMs` is the time between pulse
  // starts; pulse duration is shortened automatically if it wouldn't fit.
  _playBurst({ pulseCount, gapMs, freq, gain, pan, filterHz }) {
    const durationMs = Math.min(70, gapMs * 0.7);
    for (let i = 0; i < pulseCount; i++) {
      setTimeout(() => this._beep(freq, durationMs, gain, pan, filterHz), i * gapMs);
    }
  }

  // getDistance: () => number (meters, oni to player), read at each tick.
  // getPan: optional () => number in [-1, 1], read at each tick.
  // getDirection: optional () => { pulseCount, filterHz, pulseGapMs } | null,
  //   read at each tick. null falls back to a single plain beep.
  startDistanceBeeper({ minIntervalMs, maxIntervalMs, farDistance, captureDistance, getDistance, getPan, getDirection }) {
    this.stopDistanceBeeper();
    const span = Math.max(farDistance - captureDistance, 1);
    const scheduleNext = () => {
      const dist = getDistance();
      const clamped = Math.min(Math.max(dist, captureDistance), farDistance);
      const t = (clamped - captureDistance) / span;
      const interval = minIntervalMs + t * (maxIntervalMs - minIntervalMs);
      const pan = getPan ? getPan() : 0;
      const dir = getDirection ? getDirection() : null;

      if (dir) {
        // Keep the whole burst comfortably inside this beep's interval,
        // even at very close range where intervals get short.
        const gapMs = Math.min(dir.pulseGapMs, interval / (dir.pulseCount + 1));
        this._playBurst({ pulseCount: dir.pulseCount, gapMs, freq: 880, gain: 0.25, pan, filterHz: dir.filterHz });
      } else {
        this._beep(880, 90, 0.25, pan);
      }
      this.timer = setTimeout(scheduleNext, interval);
    };
    scheduleNext();
  }

  stopDistanceBeeper() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  playCaptureSound() {
    [660, 550, 440, 330].forEach((freq, i) => {
      setTimeout(() => this._beep(freq, 250, 0.3), i * 220);
    });
  }

  playWarningTone() {
    this._beep(220, 400, 0.3);
  }
}
