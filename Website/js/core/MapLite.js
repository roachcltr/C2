// js/core/MapLite.js
// Versi Lite Mode dari core/Map.js - peta 2D berbasis Leaflet (Canvas/DOM),
// tanpa WebGL, untuk device low-spec (dual-core CPU, tanpa GPU dedicated).
export let liteMap = null;
export const SITE_LAT = -7.749786;
export const SITE_LON = 108.502177;

export async function initMap() {
    liteMap = L.map('cesium-container', {
        center: [SITE_LAT, SITE_LON],
        zoom: 12,
        preferCanvas: true, // render marker/polyline lewat <canvas> 2D, bukan SVG/DOM per elemen
        zoomControl: true,
        attributionControl: false
    });

    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19
    }).addTo(liteMap);

    L.marker([SITE_LAT, SITE_LON], {
        icon: L.divIcon({
            className: 'site-marker-lite',
            html: '<div style="width:12px;height:12px;border-radius:50%;background:#FF474C;border:2px solid #000;"></div>',
            iconSize: [12, 12]
        })
    }).addTo(liteMap).bindTooltip('PT Len Industri', { permanent: true, direction: 'top', offset: [0, -8] });
}
