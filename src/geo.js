const EARTH_RADIUS_M = 6371000;

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function toDeg(rad) {
  return (rad * 180) / Math.PI;
}

export function distanceMeters(lat1, lon1, lat2, lon2) {
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dPhi = toRad(lat2 - lat1);
  const dLambda = toRad(lon2 - lon1);
  const a =
    Math.sin(dPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

export function bearingDegrees(lat1, lon1, lat2, lon2) {
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dLambda = toRad(lon2 - lon1);
  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  const theta = Math.atan2(y, x);
  return (toDeg(theta) + 360) % 360;
}

// Spherical direct geodetic problem: move `distanceM` meters from
// (lat, lon) along `bearingDeg` (0 = north, clockwise).
export function destinationPoint(lat, lon, bearingDeg, distanceM) {
  const delta = distanceM / EARTH_RADIUS_M;
  const theta = toRad(bearingDeg);
  const phi1 = toRad(lat);
  const lambda1 = toRad(lon);

  const sinPhi2 =
    Math.sin(phi1) * Math.cos(delta) +
    Math.cos(phi1) * Math.sin(delta) * Math.cos(theta);
  const phi2 = Math.asin(sinPhi2);

  const y = Math.sin(theta) * Math.sin(delta) * Math.cos(phi1);
  const x = Math.cos(delta) - Math.sin(phi1) * sinPhi2;
  const lambda2 = lambda1 + Math.atan2(y, x);

  return {
    lat: toDeg(phi2),
    lon: ((toDeg(lambda2) + 540) % 360) - 180,
  };
}

export function randomBearing() {
  return Math.random() * 360;
}

// Projects (lat, lon) onto a local tangent plane centered at (originLat,
// originLon), in meters, x = east, y = north. Accurate enough at the
// hundreds-of-meters scale this game operates at; not meant for large areas.
function toLocalMeters(originLat, originLon, lat, lon) {
  const dist = distanceMeters(originLat, originLon, lat, lon);
  const brg = toRad(bearingDegrees(originLat, originLon, lat, lon));
  return { x: dist * Math.sin(brg), y: dist * Math.cos(brg) };
}

function pointToSegmentDistance(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  const cx = a.x + t * dx;
  const cy = a.y + t * dy;
  return Math.hypot(p.x - cx, p.y - cy);
}

// polygon: array of { lat, lon }, at least 3 points. Ray-casting test in a
// local meter projection anchored at polygon[0] — the projection distortion
// is negligible at this game's scale, and only relative positions matter for
// the crossing-count test anyway.
export function isPointInPolygon(lat, lon, polygon) {
  if (!polygon || polygon.length < 3) return true; // no area restriction defined
  const origin = polygon[0];
  const pt = toLocalMeters(origin.lat, origin.lon, lat, lon);
  const pts = polygon.map((p) => toLocalMeters(origin.lat, origin.lon, p.lat, p.lon));
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    const intersect =
      a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function distanceToPolygonBoundaryMeters(lat, lon, polygon) {
  if (!polygon || polygon.length < 2) return Infinity;
  const origin = polygon[0];
  const pt = toLocalMeters(origin.lat, origin.lon, lat, lon);
  const pts = polygon.map((p) => toLocalMeters(origin.lat, origin.lon, p.lat, p.lon));
  let minDist = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    minDist = Math.min(minDist, pointToSegmentDistance(pt, a, b));
  }
  return minDist;
}

// [minLat, minLon, maxLat, maxLon] — used to fit a map view to a polygon.
export function polygonBounds(polygon) {
  const lats = polygon.map((p) => p.lat);
  const lons = polygon.map((p) => p.lon);
  return {
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats),
    minLon: Math.min(...lons),
    maxLon: Math.max(...lons),
  };
}
