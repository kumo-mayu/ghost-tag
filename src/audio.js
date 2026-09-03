// Distance -> sound. A single beep whose repeat interval shrinks as the
// oni gets closer (linear interpolation between captureDistance and
// farDistance). Optional experimental left/right panning conveys a rough
// direction; footsteps / volume scaling / breathing etc. stay out of scope
// for the first prototype.
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
  _beep(freq = 880, durationMs = 90, gain = 0.25, pan = 0) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;

    let outNode = g;
    if (this.ctx.createStereoPanner) {
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(panner);
      outNode = panner;
    }
    osc.connect(g);
    outNode.connect(this.ctx.destination);

    const now = this.ctx.currentTime;
    g.gain.setValueAtTime(gain, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + durationMs / 1000);
    osc.start(now);
    osc.stop(now + durationMs / 1000 + 0.02);
  }

  // getDistance: () => number (meters, oni to player), read at each tick.
  // getPan: optional () => number in [-1, 1], read at each tick.
  startDistanceBeeper({ minIntervalMs, maxIntervalMs, farDistance, captureDistance, getDistance, getPan }) {
    this.stopDistanceBeeper();
    const span = Math.max(farDistance - captureDistance, 1);
    const scheduleNext = () => {
      const dist = getDistance();
      const clamped = Math.min(Math.max(dist, captureDistance), farDistance);
      const t = (clamped - captureDistance) / span;
      const interval = minIntervalMs + t * (maxIntervalMs - minIntervalMs);
      const pan = getPan ? getPan() : 0;
      this._beep(880, 90, 0.25, pan);
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
