// Wraps navigator.geolocation. Update frequency is whatever the browser
// delivers via watchPosition; the game simulation loop (oniAI.js) does NOT
// depend on this cadence and keeps running independently.
export class GpsTracker {
  constructor({ enableHighAccuracy = true, lostTimeoutMs = 10000 } = {}) {
    this.enableHighAccuracy = enableHighAccuracy;
    this.lostTimeoutMs = lostTimeoutMs;
    this.watchId = null;
    this.lastFix = null;
    this.lastFixAt = 0;
  }

  static isSupported() {
    return 'geolocation' in navigator;
  }

  getCurrentPosition(timeoutMs = 20000) {
    return new Promise((resolve, reject) => {
      if (!GpsTracker.isSupported()) {
        reject(new Error('このブラウザはGeolocationに対応していません'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(this._toFix(pos)),
        (err) => reject(this._describeError(err)),
        { enableHighAccuracy: this.enableHighAccuracy, timeout: timeoutMs, maximumAge: 0 }
      );
    });
  }

  start(onUpdate, onError) {
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        this.lastFix = this._toFix(pos);
        this.lastFixAt = performance.now();
        onUpdate(this.lastFix);
      },
      (err) => onError(this._describeError(err)),
      { enableHighAccuracy: this.enableHighAccuracy, timeout: 20000, maximumAge: 0 }
    );
  }

  stop() {
    if (this.watchId != null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  isLost() {
    if (!this.lastFix) return false;
    return performance.now() - this.lastFixAt > this.lostTimeoutMs;
  }

  _toFix(pos) {
    return {
      lat: pos.coords.latitude,
      lon: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      // Platform-fused direction of travel, degrees / null if unavailable /
      // NaN while stationary. When present this is generally more reliable
      // than differencing two fixes ourselves (see main.js heading logic).
      heading: pos.coords.heading,
      timestamp: pos.timestamp,
    };
  }

  _describeError(err) {
    const map = {
      1: '位置情報の利用が許可されていません',
      2: '位置情報を取得できません（電波状況を確認してください）',
      3: '位置情報の取得がタイムアウトしました',
    };
    return new Error(map[err.code] || err.message || '不明なGPSエラー');
  }
}
