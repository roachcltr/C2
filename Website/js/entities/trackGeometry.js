// js/entities/trackGeometry.js

// Convert X/Y meters from the TARGET'S origin to Cesium Cartesian3 coordinates
export function getPredictionPositions(currentPosition, targetLat, targetLon, predictions, altMeters) {
    if (!predictions || predictions.length === 0) return [];
    const R = 6378137.0;
    // THE FIX: Use targetLat instead of SITE_LAT for the cosine scaling
    const cosLat = Math.cos(targetLat * (Math.PI / 180));
    const positions = [currentPosition];
    for (let i = 0; i < predictions.length; i++) {
        const p = predictions[i];
        const dLat = (p.y_offset_m / R) * (180 / Math.PI);
        const dLon = (p.x_offset_m / (R * cosLat)) * (180 / Math.PI);
        // THE FIX: Add the offset to the TARGET'S location, not the radar's location
        const predLat = targetLat + dLat;
        const predLon = targetLon + dLon;
        positions.push(Cesium.Cartesian3.fromDegrees(predLon, predLat, altMeters));
    }

    return positions;
}