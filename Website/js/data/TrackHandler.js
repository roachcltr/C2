import { updateCesiumMarkers } from '../entities/trackMain.js';
import { updateTracksTableUI } from '../ui/panels/tabTargets.js'; // Pastikan jalur path ini benar sesuai lokasinya

// ==========================================
// CENTRAL STATE MANAGEMENT
// ==========================================
const activeTracks = {};
const TRACK_TIMEOUT = 2000;

export function handleIncomingTrack(trackData) {
    // 1. Save or update the track in our state dictionary
    activeTracks[trackData.track_id] = {...trackData, lastSeen: Date.now()};

    const now = Date.now();

    for (const id in activeTracks) {
        if (now - activeTracks[id].lastSeen > TRACK_TIMEOUT) {
            delete activeTracks[id];
        }
    }

    // 2. Push the updated dictionary to the rendering engine
    updateCesiumMarkers(activeTracks);

    // 3. Konversi Object activeTracks menjadi Array untuk UI
    const tracksList = Object.values(activeTracks).map(track => {
        return {
            id: track.track_id, // Pastikan 'track_id' sesuai dengan kunci dari raw JSON backend-mu
            type: track.classification || 'UNKNOWN', 
            isEvasive: track.is_evasive || false, 
            rawJson: track // Mengirim data utuh agar dibaca fungsi renderSelectedTargetUI saat diklik
        };
    });

    // 4. Update tabel dan panel UI
    updateTracksTableUI(tracksList);
}