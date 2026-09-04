export const GameStatus = {
  READY: 'READY',
  STARTING: 'STARTING',
  RUNNING: 'RUNNING',
  ENDED: 'ENDED',
};

export const EndReason = {
  CAPTURED: 'CAPTURED',
  STOPPED: 'STOPPED',
  OUT_OF_AREA: 'OUT_OF_AREA',
};

// Starting defaults only — every value is adjustable from the setup form.
// Not tuned yet; see CLAUDE.md "未確定事項ログ".
export function defaultConfig() {
  return {
    playAreaRadius: 300,
    oniInitialDistance: 150,
    oniSpeed: 2.0,
    captureDistance: 15,
    enableHighAccuracy: true,
    areaExitGameOver: false,
    oniTickMs: 500,
    gpsLostTimeoutMs: 10000,
    audioMinIntervalMs: 150,
    audioMaxIntervalMs: 2000,
    audioFarDistance: 150,
    // Experimental: pans the beep left/right based on the oni's bearing
    // relative to the player's estimated heading of travel (derived from
    // recent GPS movement, no compass/sensor). Needs headphones/earbuds —
    // a phone's built-in speaker(s) won't convey stereo separation.
    enableStereoPan: false,
    headingMinMoveM: 5,
    // Speaker-safe direction cues (no headphones needed): pulse count in
    // each beep burst = coarse sector relative to travel direction
    // (1=front, 2=right, 3=behind, 4=left); a lowpass filter brightens
    // as the player's heading aligns with the oni and dulls as it drifts
    // away — modeled after how Microsoft Soundscape's beacon clears up
    // when you face it.
    enableDirectionalCues: true,
    directionPulseGapMs: 80,
    directionMinFilterHz: 700,
    directionMaxFilterHz: 6000,
    // Fallback heading source for when GPS can't tell us a direction of
    // travel (player stationary, or movement too small vs. GPS noise):
    // the device compass (DeviceOrientation), smoothed since a phone held
    // or armband-mounted by a running person swings/bounces constantly.
    // Only used as a last resort — GPS-derived heading (native or
    // computed from movement) always wins while actually moving.
    enableCompassFallback: true,
    compassSmoothing: 0.15, // EMA weight per sample; higher = less smoothing
    // Safety: warn when GPS accuracy is too poor to trust distance/area
    // judgments at this game's scale (CLAUDE.md 安全面).
    poorAccuracyThresholdM: 30,
  };
}
