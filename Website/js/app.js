// js/app.js
import { connectTracker, connectVideo } from './data/DataLink.js';
import { loadMapEngine } from './core/mapLoader.js';
import { handleIncomingTrack } from './data/TrackHandler.js';
// import { initVideoOverlay, handleIncomingSweep } from './overlay/VideoOverlay.js';
import { initUI, initMapDependentUI } from './ui/UI.js';
import { getLiteModePreference, applyLiteModeClass, getRadarModePreference, applyRadarModeClass } from './core/settings.js';

applyLiteModeClass(getLiteModePreference());
applyRadarModeClass(getRadarModePreference());

initUI();
connectTracker(handleIncomingTrack);
// connectVideo(handleIncomingSweep);

loadMapEngine().then(() => {
    initMapDependentUI();
    // initVideoOverlay();
}).catch((err) => {
    console.error('[MAP] Gagal inisialisasi peta:', err);
});
