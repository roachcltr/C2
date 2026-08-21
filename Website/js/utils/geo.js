// js/utils/geo.js
// Perhitungan bearing & range murni matematis (haversine) - tidak bergantung
// pada Cesium/Leaflet, supaya bisa dipakai Radar Mode tanpa load library peta.

const EARTH_RADIUS_M = 6378137.0;

function toRad(deg) {
    return deg * Math.PI / 180;
}

// Mengembalikan { bearingDeg, rangeMeters } dari titik 1 (site) ke titik 2 (track).
export function latLonToBearingRange(lat1, lon1, lat2, lon2) {
    const phi1 = toRad(lat1);
    const phi2 = toRad(lat2);
    const dPhi = toRad(lat2 - lat1);
    const dLambda = toRad(lon2 - lon1);

    // Haversine distance
    const a = Math.sin(dPhi / 2) ** 2 +
        Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const rangeMeters = EARTH_RADIUS_M * c;

    // Initial bearing
    const y = Math.sin(dLambda) * Math.cos(phi2);
    const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
    const bearingDeg = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;

    return { bearingDeg, rangeMeters };
}
