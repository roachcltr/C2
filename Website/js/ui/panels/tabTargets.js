// js/ui/panels/tabTargets.js
import { cesiumViewer } from '../../core/Map.js';
import { sendOptronicCommand } from '../../hardware/optronic.js';
import { openTrackPopup, closeTrackPopup } from '../../entities/trackPopup.js';
import { clearRawJsonDisplay } from './tabSystemNetworking.js';

// Global state to track what the user is currently looking at
let currentSelectedTrackId = null;
let activeTrackedId = null;

export function initGlobalEntitiesTab() {
    const tbody = document.getElementById('tracks-tbody');
    const targetContainer = document.getElementById('selected-target-container');
    if (!tbody || !targetContainer) return;
}

// =====================================================================
// TABLE UI: HIGH-PERFORMANCE DOM RENDERING
// =====================================================================

export function updateTracksTableUI(tracksList) {
    const tbody = document.getElementById('tracks-tbody');
    const countSpan = document.getElementById('track-count');
    const emptyMsg = document.getElementById('empty-tracks-msg');
    
    if (!tbody || !countSpan || !emptyMsg) return;

    countSpan.innerText = tracksList ? tracksList.length : 0;

    if (!tracksList || tracksList.length === 0) {
        tbody.innerHTML = '';
        emptyMsg.style.display = 'block';
        
        // If the list empties out, clear the detail card automatically
        if (currentSelectedTrackId) clearSelectedTarget();
        return;
    }

    emptyMsg.style.display = 'none';

    // Track active IDs to clean up ghost rows
    const activeIds = new Set();

    tracksList.forEach(track => {
        const trackData = track.rawJson || track;
        const id = trackData.track_id || 'UNKNOWN';
        const type = trackData.tactical_data?.classification || 'UNKNOWN';
        const isEvasive = type.includes('EVASIVE');
        
        activeIds.add(id.toString());

        let row = document.getElementById(`track-row-${id}`);

        // 1. CREATE ROW (Only happens ONCE per target lifecycle)
        if (!row) {
            row = createTrackRow(id);
            tbody.appendChild(row);
        }

        // 2. SILENT DATA BINDING (Update the underlying data without touching the DOM structure)
        row.__trackData = trackData;
        row.__isEvasive = isEvasive;
        
        const lat = trackData.tactical_data?.geospatial?.lat;
        const lon = trackData.tactical_data?.geospatial?.lon;
        const altFt = trackData.raw_asterix?.altitude?.alt_ft || 0;
        row.__lat = lat;
        row.__lon = lon;
        row.__altMeters = altFt * 0.3048;

        // 3. VISUAL UPDATES (Only update styles/text if they need to change)
        updateRowVisuals(row, type, isEvasive);

        // 4. LIVE UPDATE CARD (If this is the target currently selected in the details panel, keep its data fresh)
        if (currentSelectedTrackId === id) {
            renderSelectedTargetUI(trackData, true); // true = silent update
        }
    });

    // 5. GARBAGE COLLECTION: Remove rows that left the radar
    Array.from(tbody.children).forEach(row => {
        const rowId = row.id.replace('track-row-', '');
        if (!activeIds.has(rowId)) {
            tbody.removeChild(row);
            if (currentSelectedTrackId === rowId) clearSelectedTarget();
        }
    });
}

// Helper: Build the DOM element exactly once
function createTrackRow(id) {
    const row = document.createElement('div');
    row.id = `track-row-${id}`;
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.justifyContent = 'space-between';
    row.style.padding = '10px 16px'; 
    row.style.borderRadius = '6px'; 
    row.style.cursor = 'pointer';
    row.style.transition = 'background-color 0.2s ease';
    row.style.border = '1px solid transparent'; // Pre-allocate border

    const idSpan = document.createElement('div');
    idSpan.className = 'track-id-span';
    idSpan.style.fontFamily = 'monospace';
    idSpan.style.fontWeight = 'bold';
    idSpan.style.fontSize = '13px';
    idSpan.style.width = '65px';
    idSpan.style.color = '#ffffff';
    idSpan.innerText = id;

    const typeSpan = document.createElement('div');
    typeSpan.className = 'track-type-span';
    typeSpan.style.fontSize = '12px';
    typeSpan.style.flexGrow = '1';
    typeSpan.style.letterSpacing = '0.5px';

    row.appendChild(idSpan);
    row.appendChild(typeSpan);

    // Attach events referencing the bound data, not closure variables!
    row.addEventListener('click', () => {
        renderSelectedTargetUI(row.__trackData);
    });

    row.addEventListener('dblclick', () => {
        flyToTrack(row.__lon, row.__lat, row.__altMeters);
    });

    row.addEventListener('mouseenter', () => {
        if(!row.__isEvasive) row.style.backgroundColor = 'rgba(30, 41, 59, 0.8)';
    });

    row.addEventListener('mouseleave', () => {
        if(!row.__isEvasive) row.style.backgroundColor = 'rgba(15, 23, 42, 0.4)';
    });

    return row;
}

// Helper: Apply visual state updates smoothly
function updateRowVisuals(row, type, isEvasive) {
    const typeSpan = row.querySelector('.track-type-span');
    const displayType = type.replace(/_/g, ' ');

    if (typeSpan.innerText !== displayType) typeSpan.innerText = displayType;
    
    // Apply styling based on tactical status
    if (isEvasive) {
        row.style.borderColor = 'rgba(239, 68, 68, 0.5)';
        row.style.backgroundColor = 'rgba(69, 26, 26, 0.6)';
        typeSpan.style.color = '#fca5a5';
    } else {
        row.style.borderColor = 'rgba(255, 255, 255, 0.1)';
        row.style.backgroundColor = 'rgba(15, 23, 42, 0.4)';
        typeSpan.style.color = '#cbd5e1';
    }
}

// =====================================================================
// TARGET DETAILS CARD (JSON PANEL)
// =====================================================================

export function renderSelectedTargetUI(trackJson, isSilentUpdate = false) {
    const emptyMsg = document.getElementById('empty-target-msg');
    const jsonCard = document.getElementById('target-json-card');
    if (!emptyMsg || !jsonCard) return;

    if (!trackJson) {
        clearSelectedTarget();
        return;
    }

    const id = trackJson.track_id || 'UNKNOWN';
    currentSelectedTrackId = id; // Update global state
    window.selectedTargetId = id;

    // If it's a silent live update, just update the text values to prevent flickering
    if (isSilentUpdate && !jsonCard.classList.contains('hidden')) {
        updateCardLiveValues(trackJson);
        return;
    }

    // --- TRIGGER MAP POPUP ---
    openTrackPopup(id); // <-- ADD THIS

    // --- FULL RENDER FOR NEW SELECTIONS ---
    emptyMsg.style.display = 'none';
    jsonCard.classList.remove('hidden');
    jsonCard.innerHTML = ''; 
    
    jsonCard.style.padding = '16px'; 
    jsonCard.style.background = 'rgba(10, 15, 24, 0.8)';
    jsonCard.style.borderRadius = '6px';
    jsonCard.style.border = '1px solid rgba(255, 255, 255, 0.1)';
    jsonCard.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.3)';
    jsonCard.style.display = 'flex';
    jsonCard.style.flexDirection = 'column';
    jsonCard.style.gap = '16px'; 

    const type = trackJson.tactical_data?.classification || 'UNKNOWN';
    const rawLat = trackJson.tactical_data?.geospatial?.lat;
    const rawLon = trackJson.tactical_data?.geospatial?.lon;
    const lat = rawLat !== undefined ? rawLat.toFixed(5) : 'N/A';
    const lon = rawLon !== undefined ? rawLon.toFixed(5) : 'N/A';
    const altFt = trackJson.raw_asterix?.altitude?.alt_ft;
    const alt = altFt !== undefined ? Math.round(altFt * 0.3048) + ' m' : 'N/A';
    const lastSeenStr = trackJson.raw_asterix?.timestamp?.formatted_time || 'N/A';

    // 1. Header
    const headerTitle = document.createElement('div');
    headerTitle.style.border = '1px solid rgba(74, 222, 128, 0.3)';
    headerTitle.style.padding = '8px';
    headerTitle.style.textAlign = 'center';
    headerTitle.style.background = 'rgba(74, 222, 128, 0.05)';
    headerTitle.style.borderRadius = '4px';
    headerTitle.innerHTML = `<span style="color: var(--strokeorborder); font-weight: bold; font-size: 13px; letter-spacing: 1.5px;">TARGET: TRACK-${id}</span>`;
    jsonCard.appendChild(headerTitle);

    // 2. Data Grid (1-Column)
    const grid = document.createElement('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = '1fr';
    grid.style.gap = '10px'; 
    grid.style.fontFamily = "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";

    grid.appendChild(createDetailRow('CLASS', type.replace(/_/g, ' '), '#ffffff', 'val-class'));
    grid.appendChild(createDetailRow('STATUS', 'TRACKING', 'var(--strokeorborder)', 'val-status'));
    grid.appendChild(createDetailRow('LATITUDE', lat, '#60a5fa', 'val-lat'));
    grid.appendChild(createDetailRow('LONGITUDE', lon, '#60a5fa', 'val-lon'));
    grid.appendChild(createDetailRow('ALTITUDE', alt, '#ffffff', 'val-alt'));
    grid.appendChild(createDetailRow('LAST SEEN', lastSeenStr, '#ffffff', 'val-lastseen'));
    
    grid.lastChild.style.borderBottom = 'none';
    grid.lastChild.style.paddingBottom = '0';
    jsonCard.appendChild(grid);

    // 3. Action Buttons
    const btnContainer = document.createElement('div');
    btnContainer.style.marginTop = '4px';
    btnContainer.style.display = 'flex';
    btnContainer.style.gap = '8px';
    
    // Check Cesium state for VIEW toggle
    const targetEntityId = `track_${id}`;
    let isTracking = cesiumViewer && cesiumViewer.trackedEntity && cesiumViewer.trackedEntity.id === targetEntityId;

    const iconView = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="22" y1="12" x2="18" y2="12"></line><line x1="6" y1="12" x2="2" y2="12"></line><line x1="12" y1="6" x2="12" y2="2"></line><line x1="12" y1="22" x2="12" y2="18"></line></svg>`;
    const iconCam = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>`;
    const iconClose = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;

   // --- Determine button colors based on tracking state ---
    const isCamTracking = (activeTrackedId === id);
    const camBaseBg = isCamTracking ? 'rgba(225, 29, 72, 0.2)' : 'rgba(234, 179, 8, 0.2)';
    const camHoverBg = isCamTracking ? 'rgba(225, 29, 72, 0.5)' : 'rgba(234, 179, 8, 0.5)';
    const camBorderColor = isCamTracking ? '#be123c' : '#ca8a04';
    const camLabel = isCamTracking ? 'STOP CAM' : 'CAM';

    const viewBtn = createButton(isTracking ? 'UNVIEW' : 'VIEW', iconView, 'rgba(14, 165, 233, 0.2)', 'rgba(14, 165, 233, 0.5)', '#0284c7');
    const camBtn = createButton(camLabel, iconCam, camBaseBg, camHoverBg, camBorderColor);
    const deselectBtn = createButton('CLOSE', iconClose, 'rgba(225, 29, 72, 0.2)', 'rgba(225, 29, 72, 0.5)', '#be123c');

    viewBtn.addEventListener('click', () => {
        if (!cesiumViewer) return;
        if (isTracking) {
            cesiumViewer.trackedEntity = undefined;
            cesiumViewer.camera.cancelFlight(); 
            viewBtn.innerHTML = `${iconView} <span style="white-space: nowrap;">VIEW</span>`;
            isTracking = false;
        } else {
            cesiumViewer.trackedEntity = undefined; 
            cesiumViewer.camera.cancelFlight();
            
            const targetEntity = cesiumViewer.entities.getById(targetEntityId);
            if (targetEntity) {
                viewBtn.innerHTML = `${iconView} <span style="white-space: nowrap;">UNVIEW</span>`;
                isTracking = true;
                cesiumViewer.flyTo(targetEntity, {
                    offset: new Cesium.HeadingPitchRange(0.0, Cesium.Math.toRadians(-35.0), 3000),
                    duration: 1.5
                }).then(() => { if (isTracking) cesiumViewer.trackedEntity = targetEntity; });
            }
        }
    });

    camBtn.addEventListener('click', () => {
        if (activeTrackedId === id) {
            // STOP TRACKING
            activeTrackedId = null;
            sendOptronicCommand('STOP_TRACKING');
            console.log(`[CAM] Stopped tracking TRACK-${id}`);
        } else {
            // Automatically open the Optronic side panel ---
            const openCamBtn = document.getElementById('btn-open-camera');
            const cameraPanel = document.getElementById('right-camera-panel');

            // START TRACKING
            activeTrackedId = id;
            sendOptronicCommand(`TRACK:${id}`);
            
            // Instantly forward the first JSON payload to kickstart the C++ math
            sendOptronicCommand(JSON.stringify(trackJson));
            console.log(`[CAM] Started tracking TRACK-${id}`);
            
            // Only trigger the click if the panel is currently closed
            if (cameraPanel && cameraPanel.classList.contains('closed')) {
                openCamBtn?.click();
            }
        }
        
        // Force a re-render to update the button colors immediately
        renderSelectedTargetUI(trackJson); 
    });

    deselectBtn.addEventListener('click', () => {
        clearSelectedTarget();
    });

    btnContainer.appendChild(viewBtn);
    btnContainer.appendChild(camBtn);
    btnContainer.appendChild(deselectBtn);
    jsonCard.appendChild(btnContainer);
}

// =====================================================================
// UTILITY FUNCTIONS
// =====================================================================

function clearSelectedTarget() {
    currentSelectedTrackId = null;
    window.selectedTargetId = null;
    clearRawJsonDisplay();
    const emptyMsg = document.getElementById('empty-target-msg');
    const jsonCard = document.getElementById('target-json-card');
    
    if (emptyMsg) emptyMsg.style.display = 'block';
    if (jsonCard) {
        jsonCard.classList.add('hidden');
        jsonCard.innerHTML = '';
    }

    if (cesiumViewer) {
        cesiumViewer.trackedEntity = undefined;
        cesiumViewer.camera.cancelFlight();
    }

    closeTrackPopup();
}

function updateCardLiveValues(trackJson) {
    // Only safely update the text nodes if they exist
    const elLat = document.getElementById('val-lat');
    const elLon = document.getElementById('val-lon');
    const elAlt = document.getElementById('val-alt');
    const elSeen = document.getElementById('val-lastseen');

    if (elLat) elLat.innerText = trackJson.tactical_data?.geospatial?.lat?.toFixed(5) || 'N/A';
    if (elLon) elLon.innerText = trackJson.tactical_data?.geospatial?.lon?.toFixed(5) || 'N/A';
    if (elAlt) elAlt.innerText = (Math.round((trackJson.raw_asterix?.altitude?.alt_ft || 0) * 0.3048)) + ' m';
    if (elSeen) elSeen.innerText = trackJson.raw_asterix?.timestamp?.formatted_time || 'N/A';

    // --- NEW: FORWARD LIVE TELEMETRY TO C++ BACKEND ---
    if (activeTrackedId === trackJson.track_id) {
        sendOptronicCommand(JSON.stringify(trackJson));
    }
}

function createDetailRow(label, value, valColor, valId) {
    const container = document.createElement('div');
    container.style.display = 'flex';
    container.style.justifyContent = 'space-between';
    container.style.alignItems = 'flex-start'; 
    container.style.fontSize = '11.5px';
    container.style.letterSpacing = '0.5px';
    container.style.borderBottom = '1px solid rgba(255, 255, 255, 0.06)';
    container.style.paddingBottom = '8px';
    
    container.innerHTML = `<span style="color: #8ba2b5; min-width: 75px;">${label}</span>
                           <span id="${valId}" style="color: ${valColor}; font-weight: 600; font-family: monospace; font-size: 12px; text-align: right; word-break: break-word;">${value}</span>`;
    return container;
}

function createButton(label, svgIcon, baseBg, hoverBg, borderColor) {
    const btn = document.createElement('button');
    btn.style.flex = '1';
    btn.style.display = 'flex';
    btn.style.alignItems = 'center';
    btn.style.justifyContent = 'center';
    btn.style.gap = '6px';
    btn.style.padding = '8px 4px';
    btn.style.background = baseBg;
    btn.style.border = `1px solid ${borderColor}`;
    btn.style.color = '#ffffff';
    btn.style.fontSize = '9px';
    btn.style.fontWeight = 'bold';
    btn.style.letterSpacing = '1px';
    btn.style.cursor = 'pointer';
    btn.style.borderRadius = '4px';
    btn.style.transition = 'background 0.2s';

    btn.innerHTML = `${svgIcon} <span style="white-space: nowrap;">${label}</span>`;
    btn.onmouseenter = () => btn.style.background = hoverBg;
    btn.onmouseleave = () => btn.style.background = baseBg;
    return btn;
}

function flyToTrack(lon, lat, altMeters) {
    if (cesiumViewer && lon !== undefined && lat !== undefined) {
        cesiumViewer.trackedEntity = undefined;
        cesiumViewer.camera.cancelFlight();

        cesiumViewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(lon, lat, altMeters + 3000), 
            orientation: {
                heading: Cesium.Math.toRadians(0.0), 
                pitch: Cesium.Math.toRadians(-35.0), 
                roll: 0.0
            },
            duration: 1.5
        });
    }
}