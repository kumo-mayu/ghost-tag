// Shared lazy-loader for Leaflet, used by both the debug map (mapView.js)
// and the play-area polygon editor (areaEditor.js). CDN, so it requires
// network and is only fetched the first time either one needs it.
const LEAFLET_JS = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js';
const LEAFLET_CSS = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css';

let leafletLoadPromise = null;

export function ensureLeaflet() {
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
