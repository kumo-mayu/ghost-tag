import { bearingDegrees, destinationPoint, distanceMeters } from './geo.js';

// Minimal oni AI: always moves straight toward the player's current known
// position at a fixed speed. Runs on its own tick, independent of GPS updates
// (uses the last known player position between GPS fixes).
export class Oni {
  constructor({ lat, lon, speedMps }) {
    this.lat = lat;
    this.lon = lon;
    this.speedMps = speedMps;
  }

  update(dtSeconds, targetLat, targetLon) {
    if (dtSeconds <= 0) return;
    const dist = distanceMeters(this.lat, this.lon, targetLat, targetLon);
    const step = this.speedMps * dtSeconds;
    if (step >= dist) {
      this.lat = targetLat;
      this.lon = targetLon;
      return;
    }
    const brg = bearingDegrees(this.lat, this.lon, targetLat, targetLon);
    const next = destinationPoint(this.lat, this.lon, brg, step);
    this.lat = next.lat;
    this.lon = next.lon;
  }
}
