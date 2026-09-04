// Play-area polygon editor: tap the map to drop pins, drag to adjust, and
// hand the resulting point list back to ui.js for saving as a named slot
// (see areaStore.js). Setup-screen-only tool — this is the one place a real
// map appears outside the RUNNING debug panel, since there's no way to draw
// an accurate area without seeing real terrain/streets.
import { ensureLeaflet } from './leafletLoader.js';
import { GpsTracker } from './gps.js';

export class AreaEditor {
  constructor(containerEl) {
    this.container = containerEl;
    this.leafletMap = null;
    this.points = []; // [{ lat, lon }], in click order
    this.markers = []; // Leaflet markers, parallel to points
    this.polygon = null;
  }

  async open(initialPoints = []) {
    await ensureLeaflet();
    this._teardown();
    const L = window.L;
    this.leafletMap = L.map(this.container, { attributionControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(this.leafletMap);

    const start = initialPoints[0] || { lat: 35.681236, lon: 139.767125 }; // fallback: Tokyo Stn, only used until locate()/a click sets real points
    this.leafletMap.setView([start.lat, start.lon], initialPoints.length ? 17 : 15);

    this.leafletMap.on('click', (e) => this.addPoint(e.latlng.lat, e.latlng.lng));

    this.points = [];
    this.markers = [];
    initialPoints.forEach((p) => this.addPoint(p.lat, p.lon));
    if (initialPoints.length) this._fitToPoints();
  }

  // Best-effort recenter on the device's current position — used when
  // starting a brand-new polygon with no points yet to place yet.
  async locate() {
    const fix = await new GpsTracker().getCurrentPosition(15000);
    if (this.leafletMap) this.leafletMap.setView([fix.lat, fix.lon], 17);
    return fix;
  }

  addPoint(lat, lon) {
    const L = window.L;
    const idx = this.points.length;
    this.points.push({ lat, lon });
    const marker = L.marker([lat, lon], { draggable: true }).addTo(this.leafletMap);
    marker.on('drag', (e) => {
      this.points[idx] = { lat: e.target.getLatLng().lat, lon: e.target.getLatLng().lng };
      this._redrawPolygon();
    });
    this.markers.push(marker);
    this._redrawPolygon();
  }

  undo() {
    if (!this.points.length) return;
    this.points.pop();
    const marker = this.markers.pop();
    if (marker) this.leafletMap.removeLayer(marker);
    this._redrawPolygon();
  }

  clear() {
    this.markers.forEach((m) => this.leafletMap.removeLayer(m));
    this.points = [];
    this.markers = [];
    this._redrawPolygon();
  }

  getPoints() {
    return this.points.slice();
  }

  refreshSize() {
    if (this.leafletMap) this.leafletMap.invalidateSize();
  }

  destroy() {
    this._teardown();
  }

  _redrawPolygon() {
    const L = window.L;
    if (this.polygon) {
      this.leafletMap.removeLayer(this.polygon);
      this.polygon = null;
    }
    if (this.points.length >= 2) {
      this.polygon = L.polygon(
        this.points.map((p) => [p.lat, p.lon]),
        { color: '#ffb300', fillColor: '#ffb300', fillOpacity: 0.15 }
      ).addTo(this.leafletMap);
    }
  }

  _fitToPoints() {
    if (this.points.length < 2) return;
    const lats = this.points.map((p) => p.lat);
    const lons = this.points.map((p) => p.lon);
    this.leafletMap.fitBounds(
      [
        [Math.min(...lats), Math.min(...lons)],
        [Math.max(...lats), Math.max(...lons)],
      ],
      { padding: [30, 30] }
    );
  }

  _teardown() {
    if (this.leafletMap) {
      this.leafletMap.remove();
      this.leafletMap = null;
    }
    this.container.innerHTML = '';
    this.points = [];
    this.markers = [];
    this.polygon = null;
  }
}
