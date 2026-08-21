// js/core/mapLoader.js
// Memilih dan memuat engine peta yang tepat (Cesium 3D atau Leaflet 2D/Lite)
// secara dinamis, supaya device tanpa WebGL tidak perlu men-download/menjalankan
// library Cesium yang berat sama sekali.
import { getLiteModePreference, getRadarModePreference } from './settings.js';

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = resolve;
        s.onerror = () => reject(new Error(`Gagal load script: ${src}`));
        document.head.appendChild(s);
    });
}

function loadStyle(href) {
    return new Promise((resolve, reject) => {
        const l = document.createElement('link');
        l.rel = 'stylesheet';
        l.href = href;
        l.onload = resolve;
        l.onerror = () => reject(new Error(`Gagal load stylesheet: ${href}`));
        document.head.appendChild(l);
    });
}

// Mengembalikan 'radar', 'lite', atau 'normal' setelah peta selesai diinisialisasi.
export async function loadMapEngine() {
    const radar = getRadarModePreference();
    const lite = getLiteModePreference();

    if (radar) {
        // Radar Mode tidak butuh tile/imagery apapun - skip Cesium & Leaflet sama sekali.
        const { initMap } = await import('./MapRadar.js');
        await initMap();
        return 'radar';
    }

    if (lite) {
        await Promise.all([
            loadStyle('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'),
            loadScript('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js')
        ]);
        const { initMap } = await import('./MapLite.js');
        await initMap();
        return 'lite';
    }

    await Promise.all([
        loadStyle('https://cesium.com/downloads/cesiumjs/releases/1.114/Build/Cesium/Widgets/widgets.css'),
        loadScript('https://cesium.com/downloads/cesiumjs/releases/1.114/Build/Cesium/Cesium.js')
    ]);
    const { initMap } = await import('./Map.js');
    await initMap();
    return 'normal';
}
