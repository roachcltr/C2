// js/entities/trackLifecycle.js
import { cesiumViewer } from '../core/Map.js';
import { isLiteModeActive } from '../core/settings.js';

const TRACK_TIMEOUT = 5000;
let cleanupStarted = false;

// Removes any track (and its prediction/history lines) that hasn't been seen
// within TRACK_TIMEOUT. Expects the three entity dictionaries kept by MainTrack.js.
function cleanupStaleTracks(trackEntities, predictionEntities, historyEntities) {
    if (!cesiumViewer) return;
    const now = Date.now();
    for (const id in trackEntities) {
        if (now - trackEntities[id].lastSeen > TRACK_TIMEOUT) {
            // Remove main entity
            cesiumViewer.entities.remove(trackEntities[id]);
            delete trackEntities[id];

            // Remove prediction line
            if (predictionEntities[id]) {
                cesiumViewer.entities.remove(predictionEntities[id]);
                delete predictionEntities[id];
            }

            // Remove history line
            if (historyEntities[id]) {
                cesiumViewer.entities.remove(historyEntities[id]);
                delete historyEntities[id];
            }
        }
    }
}

export function startCleanupTimer(trackEntities, predictionEntities, historyEntities) {
    if (cleanupStarted) return;
    cleanupStarted = true;

    // Lite Mode: cek lebih jarang untuk kurangi beban CPU pada device low-spec.
    const interval = isLiteModeActive() ? 2000 : 500;
    setInterval(() => cleanupStaleTracks(trackEntities, predictionEntities, historyEntities), interval);
}