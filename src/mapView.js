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
import { distanceMeters, bearingDegrees, polygonBounds } from './geo.js';
import { ensureLeaflet } from './leafletLoader.js';

// Capped so a long play session doesn't grow the trail arrays unbounded.
const MAX_TRAIL_POINTS = 500;

export class MapView {
  constructor(containerEl) {
    this.container = containerEl;
    this.mode = 'off';
    this.orientation = 'north'; // 'north' | 'heading' — heading-up only implemented for 'simple'
    this.canvas = null;
    this.ctx = null;
    this.leafletMap = null;
    this.markers = {};
    this.mappedStart = null;
    this.playerTrail = [];
    this.oniTrail = [];
  }

  setOrientation(mode) {
    this.orientation = mode;
  }

  // Call when a new play session starts so the previous session's trail
  // (drawn relative to its own start point) doesn't linger into the new one.
  resetTrail() {
    this.playerTrail = [];
    this.oniTrail = [];
    if (this.markers.playerTrail) this.markers.playerTrail.setLatLngs([]);
    if (this.markers.oniTrail) this.markers.oniTrail.setLatLngs([]);
  }

  _pushTrail(trail, lat, lon) {
    const last = trail[trail.length - 1];
    if (last && last.lat === lat && last.lon === lon) return;
    trail.push({ lat, lon });
    if (trail.length > MAX_TRAIL_POINTS) trail.shift();
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
    this.mappedStart = null;
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

  update({ player, oni, startPoint, playAreaPolygon, captureDistance, playerHeading }) {
    if (this.mode === 'off') return;
    this._pushTrail(this.playerTrail, player.lat, player.lon);
    this._pushTrail(this.oniTrail, oni.lat, oni.lon);
    if (this.mode === 'simple') this._updateCanvas({ player, oni, startPoint, playAreaPolygon, captureDistance, playerHeading });
    else if (this.mode === 'osm') this._updateLeaflet({ player, oni, startPoint, playAreaPolygon, playerHeading });
  }

  _updateCanvas({ player, oni, startPoint, playAreaPolygon, captureDistance, playerHeading }) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.fillStyle = '#0b0d10';
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;
    const oniDist = distanceMeters(player.lat, player.lon, oni.lat, oni.lon);
    const polygonExtent =
      playAreaPolygon && playAreaPolygon.length
        ? Math.max(...playAreaPolygon.map((p) => distanceMeters(startPoint.lat, startPoint.lon, p.lat, p.lon)))
        : 30;
    const extent = Math.max(polygonExtent * 1.3, oniDist * 1.3, 30);
    const scale = Math.min(w, h) / 2 / extent;

    // Heading-up: rotate the whole projection so the player's current
    // heading points to the top of the canvas instead of true north.
    const rotationOffset = this.orientation === 'heading' && playerHeading != null ? playerHeading : 0;

    const project = (lat, lon) => {
      const dist = distanceMeters(startPoint.lat, startPoint.lon, lat, lon);
      const brg = ((bearingDegrees(startPoint.lat, startPoint.lon, lat, lon) - rotationOffset) * Math.PI) / 180;
      return {
        x: cx + Math.sin(brg) * dist * scale,
        y: cy - Math.cos(brg) * dist * scale,
      };
    };

    // Orientation reference mark at the top of the canvas.
    ctx.fillStyle = '#9aa0a6';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(this.orientation === 'heading' ? '▲進行方向' : 'N', cx, 14);

    this._drawTrail(this.playerTrail, project, 'rgba(61,220,132,0.35)');
    this._drawTrail(this.oniTrail, project, 'rgba(255,82,82,0.3)');

    const startXY = project(startPoint.lat, startPoint.lon);
    if (playAreaPolygon && playAreaPolygon.length >= 3) {
      ctx.strokeStyle = '#ffb300';
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      playAreaPolygon.forEach((p, i) => {
        const xy = project(p.lat, p.lon);
        if (i === 0) ctx.moveTo(xy.x, xy.y);
        else ctx.lineTo(xy.x, xy.y);
      });
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);
    }
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

    if (playerHeading != null) {
      const arrowAngle = ((playerHeading - rotationOffset) * Math.PI) / 180;
      const len = 14;
      const tip = { x: pXY.x + Math.sin(arrowAngle) * len, y: pXY.y - Math.cos(arrowAngle) * len };
      const back = Math.PI * 0.75;
      const l1 = { x: pXY.x + Math.sin(arrowAngle + back) * 7, y: pXY.y - Math.cos(arrowAngle + back) * 7 };
      const l2 = { x: pXY.x + Math.sin(arrowAngle - back) * 7, y: pXY.y - Math.cos(arrowAngle - back) * 7 };
      ctx.fillStyle = '#e6e6e6';
      ctx.beginPath();
      ctx.moveTo(tip.x, tip.y);
      ctx.lineTo(l1.x, l1.y);
      ctx.lineTo(l2.x, l2.y);
      ctx.closePath();
      ctx.fill();
    }

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

  _drawTrail(trail, project, color) {
    if (trail.length < 2) return;
    const ctx = this.ctx;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    trail.forEach((p, i) => {
      const xy = project(p.lat, p.lon);
      if (i === 0) ctx.moveTo(xy.x, xy.y);
      else ctx.lineTo(xy.x, xy.y);
    });
    ctx.stroke();
    ctx.lineWidth = 1;
  }

  _headingIcon(headingDeg) {
    const L = window.L;
    return L.divIcon({
      className: '',
      html: `<div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:16px solid #e6e6e6;transform:rotate(${headingDeg}deg);transform-origin:50% 100%;"></div>`,
      iconSize: [12, 16],
      iconAnchor: [6, 16],
    });
  }

  _updateLeaflet({ player, oni, startPoint, playAreaPolygon, playerHeading }) {
    const L = window.L;
    if (!this.leafletMap) return;
    const hasPolygon = playAreaPolygon && playAreaPolygon.length >= 3;
    if (!this.markers.player) {
      // Leaflet layers (e.g. L.Polygon#getBounds) need the map to already
      // have a view/projection before they can be queried, so set the
      // initial view from plain lat/lon math BEFORE adding any layers —
      // calling fitBounds(layer.getBounds()) here throws because the map
      // has no view yet.
      if (hasPolygon) this._fitPolygon(playAreaPolygon);
      else this.leafletMap.setView([startPoint.lat, startPoint.lon], 17);

      this.markers.playerTrail = L.polyline(this._trailLatLngs(this.playerTrail), {
        color: '#3ddc84',
        weight: 2,
        opacity: 0.5,
      }).addTo(this.leafletMap);
      this.markers.oniTrail = L.polyline(this._trailLatLngs(this.oniTrail), {
        color: '#ff5252',
        weight: 2,
        opacity: 0.4,
      }).addTo(this.leafletMap);
      this.markers.start = L.circleMarker([startPoint.lat, startPoint.lon], {
        radius: 4,
        color: '#9aa0a6',
      }).addTo(this.leafletMap);
      if (hasPolygon) {
        this.markers.playArea = L.polygon(this._trailLatLngs(playAreaPolygon), {
          color: '#ffb300',
          fill: false,
          dashArray: '6,4',
        }).addTo(this.leafletMap);
      }
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
      if (playerHeading != null) {
        this.markers.heading = L.marker([player.lat, player.lon], {
          icon: this._headingIcon(playerHeading),
          interactive: false,
        }).addTo(this.leafletMap);
      }
      this.mappedStart = { ...startPoint };
    } else {
      const startChanged =
        !this.mappedStart ||
        this.mappedStart.lat !== startPoint.lat ||
        this.mappedStart.lon !== startPoint.lon;
      this.markers.start.setLatLng([startPoint.lat, startPoint.lon]);
      this.markers.player.setLatLng([player.lat, player.lon]);
      this.markers.oni.setLatLng([oni.lat, oni.lon]);
      // The play area polygon is fixed for the whole session (unlike the
      // old radius, which recentered on the player's start point), so it's
      // only (re)drawn once here rather than every tick.
      if (hasPolygon && !this.markers.playArea) {
        this.markers.playArea = L.polygon(this._trailLatLngs(playAreaPolygon), {
          color: '#ffb300',
          fill: false,
          dashArray: '6,4',
        }).addTo(this.leafletMap);
      }
      this.markers.playerTrail.setLatLngs(this._trailLatLngs(this.playerTrail));
      this.markers.oniTrail.setLatLngs(this._trailLatLngs(this.oniTrail));
      if (playerHeading != null) {
        if (this.markers.heading) {
          this.markers.heading.setLatLng([player.lat, player.lon]);
          this.markers.heading.setIcon(this._headingIcon(playerHeading));
        } else {
          this.markers.heading = L.marker([player.lat, player.lon], {
            icon: this._headingIcon(playerHeading),
            interactive: false,
          }).addTo(this.leafletMap);
        }
      } else if (this.markers.heading) {
        this.leafletMap.removeLayer(this.markers.heading);
        this.markers.heading = null;
      }
      if (startChanged) {
        if (hasPolygon) this._fitPolygon(playAreaPolygon);
        else this.leafletMap.setView([startPoint.lat, startPoint.lon], 17);
        this.mappedStart = { ...startPoint };
      }
    }
  }

  _trailLatLngs(trail) {
    return trail.map((p) => [p.lat, p.lon]);
  }

  _fitPolygon(polygon) {
    const b = polygonBounds(polygon);
    this.leafletMap.fitBounds(
      [
        [b.minLat, b.minLon],
        [b.maxLat, b.maxLon],
      ],
      { padding: [10, 10] }
    );
  }
}
