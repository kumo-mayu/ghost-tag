export const GameStatus = {
  READY: 'READY',
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
  };
}
