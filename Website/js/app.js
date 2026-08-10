// js/app.js
import { connectTracker, connectVideo } from './data/DataLink.js';
import { initMap } from './core/Map.js';
import { handleIncomingTrack } from './data/TrackHandler.js';
// import { initVideoOverlay, handleIncomingSweep } from './overlay/VideoOverlay.js';
import { initUI } from './ui/UI.js';

initMap().then(() => {
    // Data Link Connections
    connectTracker(handleIncomingTrack);
    // connectVideo(handleIncomingSweep);

    // Initializations
    // initVideoOverlay();
    initUI();
});