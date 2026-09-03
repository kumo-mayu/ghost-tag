// Debug-only map view for verifying player/oni positions. Two swappable
// render modes:
//  - "simple": local-tangent-plane plot on <canvas>, no external deps,
//    works offline. Uses geo.js distance/bearing so it's an accurate
//    projection, just without real terrain/roads.
//  - "osm": real map tiles via Leaflet + OpenStreetMap, loaded lazily
//    from a CDN only when this mode is first selected (requires network).
//
// This is never shown on the RUNNING screen outside the debug panel — the
// core game experience stays audio-only per CLAUDE.md.
import { distanceMeters, bearingDegrees } from './geo.js';

const LEAFLET_JS = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js';
const LEAFLET_CSS = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css';

let leafletLoadPromise = null;

function ensureLeaflet() {
  if (window.L) return Promise.resolve();
  if (leafletLoadPromise) return leafletLoadPromise;
  leafletLoadPromise = new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = LEAFLET_CSS;
    document.head.appendChild(link);

    const script = document.createElement('script');
    script.src = LEAFLET_JS;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error('地図ライブラリの読み込みに失敗しました（オフラインの可能性があります）'));
    document.head.appendChild(script);
  });
  return leafletLoadPromise;
}

export class MapView {
  constructor(containerEl) {
    this.container = containerEl;
    this.mode = 'off';
    this.canvas = null;
    this.ctx = null;
    this.leafletMap = null;
    this.markers = {};
  }

  async setMode(mode) {
    this._teardown();
    if (mode === 'off') {
      this.mode = 'off';
      this.container.hidden = true;
      return;
    }
    if (mode === 'simple') {
      this.mode = 'simple';
      this.container.hidden = false;
      this._setupCanvas();
      return;
    }
    if (mode === 'osm') {
      this.container.hidden = false;
      try {
        await ensureLeaflet();
        this.mode = 'osm';
        this._setupLeaflet();
      } catch (err) {
        this.mode = 'off';
        this.container.hidden = true;
        throw err;
      }
    }
  }

  // Call after the container becomes visible again (e.g. debug panel
  // toggled back on) so Leaflet recalculates its tile grid correctly.
  refreshSize() {
    if (this.leafletMap) this.leafletMap.invalidateSize();
  }

  _teardown() {
    if (this.leafletMap) {
      this.leafletMap.remove();
      this.leafletMap = null;
    }
    this.container.innerHTML = '';
    this.canvas = null;
    this.ctx = null;
    this.markers = {};
  }

  _setupCanvas() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.container.clientWidth || 320;
    this.canvas.height = 260;
    this.container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
  }

  _setupLeaflet() {
    const div = document.createElement('div');
    div.style.width = '100%';
    div.style.height = '260px';
    this.container.appendChild(div);
    this.leafletMap = window.L.map(div, { attributionControl: true });
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(this.leafletMap);
  }

  update({ player, oni, startPoint, playAreaRadius, captureDistance }) {
    if (this.mode === 'simple') this._updateCanvas({ player, oni, startPoint, playAreaRadius, captureDistance });
    else if (this.mode === 'osm') this._updateLeaflet({ player, oni, startPoint, playAreaRadius });
  }

  _updateCanvas({ player, oni, startPoint, playAreaRadius, captureDistance }) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.fillStyle = '#0b0d10';
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;
    const oniDist = distanceMeters(player.lat, player.lon, oni.lat, oni.lon);
    const extent = Math.max(playAreaRadius * 1.3, oniDist * 1.3, 30);
    const scale = Math.min(w, h) / 2 / extent;

    const project = (lat, lon) => {
      const dist = distanceMeters(startPoint.lat, startPoint.lon, lat, lon);
      const brg = (bearingDegrees(startPoint.lat, startPoint.lon, lat, lon) * Math.PI) / 180;
      return {
        x: cx + Math.sin(brg) * dist * scale,
        y: cy - Math.cos(brg) * dist * scale,
      };
    };

    const startXY = project(startPoint.lat, startPoint.lon);
    ctx.strokeStyle = '#ffb300';
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.arc(startXY.x, startXY.y, playAreaRadius * scale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#5c636b';
    ctx.beginPath();
    ctx.arc(startXY.x, startXY.y, 3, 0, Math.PI * 2);
    ctx.fill();

    const pXY = project(player.lat, player.lon);
    if (player.accuracy) {
      ctx.strokeStyle = 'rgba(61,220,132,0.4)';
      ctx.beginPath();
      ctx.arc(pXY.x, pXY.y, player.accuracy * scale, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,82,82,0.5)';
    ctx.beginPath();
    ctx.arc(pXY.x, pXY.y, captureDistance * scale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#3ddc84';
    ctx.beginPath();
    ctx.arc(pXY.x, pXY.y, 6, 0, Math.PI * 2);
    ctx.fill();

    const oXY = project(oni.lat, oni.lon);
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.beginPath();
    ctx.moveTo(pXY.x, pXY.y);
    ctx.lineTo(oXY.x, oXY.y);
    ctx.stroke();
    ctx.fillStyle = '#ff5252';
    ctx.beginPath();
    ctx.arc(oXY.x, oXY.y, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  _updateLeaflet({ player, oni, startPoint, playAreaRadius }) {
    const L = window.L;
    if (!this.leafletMap) return;
    if (!this.markers.player) {
      // Leaflet layers (e.g. L.Circle#getBounds) need the map to already
      // have a view/projection before they can be queried, so set the
      // initial view from plain lat/lon math BEFORE adding any layers —
      // calling fitBounds(layer.getBounds()) here throws because the map
      // has no view yet.
      const latDelta = playAreaRadius / 111320;
      const lonDelta = playAreaRadius / (111320 * Math.cos((startPoint.lat * Math.PI) / 180) || 1);
      this.leafletMap.fitBounds(
        [
          [startPoint.lat - latDelta, startPoint.lon - lonDelta],
          [startPoint.lat + latDelta, startPoint.lon + lonDelta],
        ],
        { padding: [10, 10] }
      );

      this.markers.start = L.circleMarker([startPoint.lat, startPoint.lon], {
        radius: 4,
        color: '#9aa0a6',
      }).addTo(this.leafletMap);
      this.markers.playArea = L.circle([startPoint.lat, startPoint.lon], {
        radius: playAreaRadius,
        color: '#ffb300',
        fill: false,
        dashArray: '6,4',
      }).addTo(this.leafletMap);
      this.markers.player = L.circleMarker([player.lat, player.lon], {
        radius: 7,
        color: '#3ddc84',
        fillColor: '#3ddc84',
        fillOpacity: 0.9,
      }).addTo(this.leafletMap);
      this.markers.oni = L.circleMarker([oni.lat, oni.lon], {
        radius: 7,
        color: '#ff5252',
        fillColor: '#ff5252',
        fillOpacity: 0.9,
      }).addTo(this.leafletMap);
    } else {
      this.markers.player.setLatLng([player.lat, player.lon]);
      this.markers.oni.setLatLng([oni.lat, oni.lon]);
      this.markers.playArea.setRadius(playAreaRadius);
    }
  }
}
