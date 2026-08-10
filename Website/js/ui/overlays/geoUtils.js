// js/ui/overlays/geoUtils.js

export function getRingPositions(centerLon, centerLat, radiusMeters, steps = 120) {
    const positions = [];
    const earthRadius = 6378137.0;
    const latRad = centerLat * (Math.PI / 180.0);

    for (let i = 0; i <= steps; i++) {
        const angle = (i / steps) * Math.PI * 2.0;
        const dx = radiusMeters * Math.cos(angle);
        const dy = radiusMeters * Math.sin(angle);

        const dLat = (dy / earthRadius) * (180.0 / Math.PI);
        const dLon = (dx / (earthRadius * Math.cos(latRad))) * (180.0 / Math.PI);

        positions.push(Cesium.Cartesian3.fromDegrees(centerLon + dLon, centerLat + dLat));
    }
    return positions;
}