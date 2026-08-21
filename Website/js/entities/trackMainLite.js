// js/entities/trackMainLite.js
// Versi Lite Mode dari trackMain.js - marker & trail polyline biasa via Leaflet,
// digambar ulang hanya saat ada data baru (bukan tiap animation frame seperti
// CallbackProperty di Cesium).
import { liteMap } from '../core/MapLite.js';
import { getClassColorHex, getClassSymbol, formatAltitude } from './trackVisuals.js';

const markerEntities = {};
const trailEntities = {};
const MAX_HISTORY_POINTS = 15;
const TRACK_TIMEOUT = 5000;

function buildIcon(classification, colorHex) {
    return L.icon({
        iconUrl: getClassSymbol(classification, colorHex),
        iconSize: [28, 28],
        iconAnchor: [14, 14]
    });
}

export function updateLeafletMarkers(activeTracks) {
    if (!liteMap) return;

    for (const [id, track] of Object.entries(activeTracks)) {
        const geo = track.tactical_data?.geospatial;
        if (!geo) continue;

        const altFt = track.raw_asterix?.altitude?.alt_ft || 0;
        const altMeters = altFt * 0.3048;
        const classification = track.tactical_data?.classification || "UNKNOWN";
        const colorHex = getClassColorHex(classification);
        const latlng = [geo.lat, geo.lon];
        const labelHtml = `TRK-${id}<br>${formatAltitude(altMeters)}m`;

        if (!markerEntities[id]) {
            const marker = L.marker(latlng, { icon: buildIcon(classification, colorHex) }).addTo(liteMap);
            marker.bindTooltip(labelHtml, { permanent: true, direction: 'right', offset: [10, 0], className: 'track-label-lite' });
            marker.lastSeen = Date.now();
            markerEntities[id] = marker;

            const trail = L.polyline([latlng], { color: colorHex, weight: 2, opacity: 0.7 }).addTo(liteMap);
            trail.customPositions = [latlng];
            trailEntities[id] = trail;
        } else {
            const marker = markerEntities[id];
            marker.setLatLng(latlng);
            marker.setIcon(buildIcon(classification, colorHex));
            marker.setTooltipContent(labelHtml);
            marker.lastSeen = Date.now();

            const trail = trailEntities[id];
            const last = trail.customPositions[trail.customPositions.length - 1];
            if (!last || last[0] !== latlng[0] || last[1] !== latlng[1]) {
                trail.customPositions.push(latlng);
                if (trail.customPositions.length > MAX_HISTORY_POINTS) {
                    trail.customPositions.shift();
                }
                trail.setLatLngs(trail.customPositions);
                trail.setStyle({ color: colorHex });
            }
        }
    }
}

function cleanupStaleLeafletTracks() {
    if (!liteMap) return;
    const now = Date.now();
    for (const id in markerEntities) {
        if (now - markerEntities[id].lastSeen > TRACK_TIMEOUT) {
            liteMap.removeLayer(markerEntities[id]);
            delete markerEntities[id];
            if (trailEntities[id]) {
                liteMap.removeLayer(trailEntities[id]);
                delete trailEntities[id];
            }
        }
    }
}

let cleanupStarted = false;
export function startLiteCleanupTimer() {
    if (cleanupStarted) return;
    cleanupStarted = true;
    setInterval(cleanupStaleLeafletTracks, 2000);
}

startLiteCleanupTimer();
