// trackPopup.js
import { cesiumViewer } from '../core/Map.js';

let selectedTrackId = null;
let selectedEntity = null;

// =====================================================================
// EXPORTED CONTROLS (Allows the sidebar to command the popup)
// =====================================================================

export function openTrackPopup(trackId) {
    selectedTrackId = trackId.toString();
    // Grab the actual 3D entity from Cesium so the popup knows who to follow
    selectedEntity = cesiumViewer.entities.getById(`track_${trackId}`);
    
    if (selectedEntity) {
        document.getElementById('popup-title').innerText = `TRK-${trackId}`;
        document.getElementById('target-popup').style.display = 'flex';
    }
}

export function closeTrackPopup() {
    selectedTrackId = null;
    selectedEntity = null;
    const popup = document.getElementById('target-popup');
    if (popup) popup.style.display = 'none';
}

// =====================================================================
// INITIALIZATION & MAP LOGIC
// =====================================================================

export function initTrackPopup() {
    const closeBtn = document.getElementById('popup-close');

    // 1. Handle UI Close Button
    closeBtn.addEventListener('click', () => {
        closeTrackPopup();
    });

    // 2. Upgraded Cesium Click Listener
    const handler = new Cesium.ScreenSpaceEventHandler(cesiumViewer.scene.canvas);
    
    handler.setInputAction((click) => {
        const pickedObject = cesiumViewer.scene.pick(click.position);
        let foundId = null;

        // Robust check: Handle both raw strings and full Entity objects
        if (Cesium.defined(pickedObject) && Cesium.defined(pickedObject.id)) {
            const entityId = typeof pickedObject.id === 'string' ? pickedObject.id : pickedObject.id.id;
            
            if (entityId && entityId.startsWith('track_')) {
                foundId = entityId.replace('track_', '');
            }
        }

        if (foundId) {
            openTrackPopup(foundId);
        } else {
            closeTrackPopup();
        }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    // 3. Pin the HTML overlay to the moving 3D entity every frame
    const popup = document.getElementById('target-popup');
    
    cesiumViewer.scene.preRender.addEventListener(() => {
        if (selectedEntity && popup.style.display !== 'none') {
            const position = selectedEntity.position.getValue(cesiumViewer.clock.currentTime);
            
            if (position) {
                const screenPosition = Cesium.SceneTransforms.wgs84ToWindowCoordinates(cesiumViewer.scene, position);
                if (screenPosition) {
                    popup.style.left = `${screenPosition.x + 40}px`;
                    popup.style.top = `${screenPosition.y - 50}px`;
                }
            }
        }
    });
}

// 4. Feed Live Data
export function feedPopupData(trackId, rawJsonData) {
    if (selectedTrackId === trackId.toString()) {
        const container = document.getElementById('popup-data');
        if (!container) return;

        // Safely extract the nested objects
        const ast = rawJsonData.raw_asterix || {};
        const tac = rawJsonData.tactical_data || {};
        const pos = ast.position || {};
        const vel = ast.velocity || {};
        const alt = ast.altitude || {};
        const geo = tac.geospatial || {};
        const time = ast.timestamp || {};

        // Format the variables for display
        const classification = tac.classification || "UNKNOWN";
        const threat = tac.threat_score || 0;
        const speedMs = vel.speed_mps ? vel.speed_mps.toFixed(1) : "0.0";
        const headingDeg = vel.hdg_deg ? vel.hdg_deg.toFixed(1) : "0.0";
        const altMeters = alt.alt_ft ? Math.round(alt.alt_ft * 0.3048) : 0;
        const rangeMeters = pos.range_m ? pos.range_m.toFixed(1) : "0.0";
        const snr = ast.radar && ast.radar.snr ? ast.radar.snr : "N/A";
        const lastSeen = time.formatted_time || 'N/A';
        const lat = geo.lat ? geo.lat.toFixed(5) : "N/A";
        const lon = geo.lon ? geo.lon.toFixed(5) : "N/A";

        // Dynamic color coding for threat levels
        let threatColor = "#4ade80"; // Safe (Green)
        if (threat >= 50) threatColor = "#fbbf24"; // Warning (Yellow)
        if (threat >= 75 || classification.includes("EVASIVE")) threatColor = "#ef4444"; // Hostile (Red)

        // Build the CSS grid layout
        container.innerHTML = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-family: 'JetBrains Mono', monospace; font-size: 11px;">
                
                <div style="color: #8ba2b5;">CLASSIFICATION</div>
                <div style="color: ${threatColor}; text-align: right; font-weight: bold;">${classification}</div>

                <div style="color: #8ba2b5;">THREAT SCORE</div>
                <div style="color: ${threatColor}; text-align: right; font-weight: bold;">${threat} / 100</div>

                <div style="border-bottom: 1px solid rgba(255,255,255,0.1); grid-column: span 2; margin: 4px 0;"></div>

                <div style="color: #8ba2b5;">SPEED</div>
                <div style="color: #60a5fa; text-align: right;">${speedMs} m/s</div>

                <div style="color: #8ba2b5;">HEADING</div>
                <div style="color: #60a5fa; text-align: right;">${headingDeg}°</div>

                <div style="color: #8ba2b5;">ALTITUDE</div>
                <div style="color: #ffffff; text-align: right;">${altMeters} m</div>

                <div style="color: #8ba2b5;">RANGE</div>
                <div style="color: #ffffff; text-align: right;">${rangeMeters} m</div>

                <div style="border-bottom: 1px solid rgba(255,255,255,0.1); grid-column: span 2; margin: 4px 0;"></div>

                <div style="color: #8ba2b5;">COORDINATES</div>
                <div style="color: #cbd5e1; text-align: right;">${lat}, ${lon}</div>

                <div style="color: #8ba2b5;">RADAR SNR</div>
                <div style="color: #cbd5e1; text-align: right;">${snr} dB</div>

                <div style="color: #8ba2b5;">LAST SEEN</div>
                <div style="color: #cbd5e1; text-align: right;">${lastSeen}</div>
            </div>
        `;
    }
}