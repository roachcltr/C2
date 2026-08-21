// js/ui/panels/tabTargets.js
import { cesiumViewer } from '../../core/Map.js';
import { sendOptronicCommand } from '../../hardware/optronic.js';

// Global state to track what the user is currently looking at
let currentSelectedTrackId = null;
let activeTrackedId = null;

// NEW: Global state to track which drone tubes have been fired
const emptyTubes = new Set([6, 11]); // Starting with 6 and 11 empty for realism

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

    // If it's a silent live update, just update the text values to prevent flickering
    if (isSilentUpdate && !jsonCard.classList.contains('hidden')) {
        updateCardLiveValues(trackJson);
        return;
    }

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

    const iconIntercept = `<svg width="14" height="14" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 10h4v4h-4zm0 0L6.5 6.5M9.96 6A3.5 3.5 0 1 0 6 9.96m8 .04l3.5-3.5m.5 3.46A3.5 3.5 0 1 0 14.04 6M14 14l3.5 3.5m-3.46.5A3.5 3.5 0 1 0 18 14.04M10 14l-3.5 3.5M6 14.04A3.5 3.5 0 1 0 9.96 18"/></svg>`;
    const iconView = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="22" y1="12" x2="18" y2="12"></line><line x1="6" y1="12" x2="2" y2="12"></line><line x1="12" y1="6" x2="12" y2="2"></line><line x1="12" y1="22" x2="12" y2="18"></line></svg>`;
    const iconCam = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>`;
    const iconClose = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;

   // --- Determine button colors based on tracking state ---
    const isCamTracking = (activeTrackedId === id);
    const camBaseBg = isCamTracking ? 'rgba(225, 29, 72, 0.2)' : 'rgba(234, 179, 8, 0.2)';
    const camHoverBg = isCamTracking ? 'rgba(225, 29, 72, 0.5)' : 'rgba(234, 179, 8, 0.5)';
    const camBorderColor = isCamTracking ? '#be123c' : '#ca8a04';
    const camLabel = isCamTracking ? 'STOP CAM' : 'CAM';

    // New Intercept Button
    const interceptBtn = createButton('INTERCEPT', iconIntercept, 'rgba(168, 85, 247, 0.2)', 'rgba(168, 85, 247, 0.5)', '#9333ea');
    const viewBtn = createButton(isTracking ? 'UNVIEW' : 'VIEW', iconView, 'rgba(14, 165, 233, 0.2)', 'rgba(14, 165, 233, 0.5)', '#0284c7');
    const camBtn = createButton(camLabel, iconCam, camBaseBg, camHoverBg, camBorderColor);
    const deselectBtn = createButton('CLOSE', iconClose, 'rgba(225, 29, 72, 0.2)', 'rgba(225, 29, 72, 0.5)', '#be123c');

    interceptBtn.addEventListener('click', () => {
        openInterceptModal(id);
    });

    viewBtn.addEventListener('click', () => {
        if (!cesiumViewer) return;
        const labelSpan = viewBtn.querySelector('.btn-label');
        if (isTracking) {
            cesiumViewer.trackedEntity = undefined;
            cesiumViewer.camera.cancelFlight(); 
            if(labelSpan) labelSpan.innerText = 'VIEW';
            isTracking = false;
        } else {
            cesiumViewer.trackedEntity = undefined; 
            cesiumViewer.camera.cancelFlight();
            
            const targetEntity = cesiumViewer.entities.getById(targetEntityId);
            if (targetEntity) {
                if(labelSpan) labelSpan.innerText = 'UNVIEW';
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

    // Added Intercept button first in the container hierarchy
    btnContainer.appendChild(interceptBtn);
    btnContainer.appendChild(viewBtn);
    btnContainer.appendChild(camBtn);
    btnContainer.appendChild(deselectBtn);
    jsonCard.appendChild(btnContainer);
}

// =====================================================================
// TACTICAL INTERCEPT MODAL LOGIC (AUTO-INJECTED)
// =====================================================================

function openInterceptModal(targetId) {
    let overlay = document.getElementById('intercept-modal-overlay');
    
    // Inject the DOM and CSS elements on the first click
    if (!overlay) {
        // --- 1. Inject Styles ---
        const style = document.createElement('style');
        style.innerHTML = `
            #intercept-modal-overlay {
                position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
                background: rgba(0, 0, 0, 0.85); z-index: 9999;
                display: flex; align-items: center; justify-content: center;
                backdrop-filter: blur(5px);
            }
            #intercept-modal-overlay.hidden { display: none; }
            .intercept-modal {
                background: #111827; border: 1px solid #9333ea; border-radius: 8px;
                width: 520px; display: flex; flex-direction: column;
                box-shadow: 0 0 30px rgba(147, 51, 234, 0.25);
            }
            .intercept-modal .modal-header {
                background: rgba(147, 51, 234, 0.15); padding: 12px 20px;
                border-bottom: 1px solid #9333ea; display: flex; justify-content: space-between;
                align-items: center; font-weight: bold; color: #c084fc; font-family: monospace; letter-spacing: 1.5px;
            }
            .intercept-modal .close-btn {
                background: none; border: none; color: #c084fc; font-size: 24px; line-height: 1; cursor: pointer; padding: 0;
            }
            .intercept-modal .close-btn:hover { color: #ffffff; }
            .intercept-modal .modal-body { padding: 24px; }
            .launcher-grid {
                display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px;
                background: #1e1e24; padding: 16px; border: 2px solid #3f3f46; border-radius: 6px;
            }
            .drone-slot {
                aspect-ratio: 1; background: #09090b; border: 2px solid #52525b; border-radius: 4px;
                display: flex; align-items: center; justify-content: center;
                cursor: pointer; position: relative; transition: all 0.2s;
            }
            .drone-slot:hover:not(.empty) { 
                border-color: #9333ea; background: rgba(147, 51, 234, 0.1); 
            }
            .drone-slot.selected { 
                border-color: #facc15; background: rgba(250, 204, 21, 0.15); 
                box-shadow: 0 0 15px rgba(250, 204, 21, 0.4) inset; 
            }
            .drone-slot.empty { cursor: not-allowed; opacity: 0.3; }
            .slot-number {
                position: absolute; top: 4px; left: 6px; font-size: 10px;
                color: #71717a; font-family: monospace; font-weight: bold;
            }
            .drone-svg { width: 55%; height: 55%; color: #a1a1aa; }
            .drone-slot.selected .drone-svg { color: #facc15; }
            .drone-slot:hover:not(.empty):not(.selected) .drone-svg { color: #d8b4fe; }
            .intercept-modal .modal-footer {
                padding: 16px 20px; border-top: 1px solid #3f3f46;
                display: flex; justify-content: space-between; align-items: center;
            }
            .launch-btn {
                background: #dc2626; color: white; border: 1px solid #ef4444;
                padding: 10px 20px; font-weight: bold; font-family: monospace; letter-spacing: 1.5px;
                border-radius: 4px; cursor: pointer; transition: 0.2s; font-size: 14px;
            }
            .launch-btn:hover:not(:disabled) { background: #b91c1c; box-shadow: 0 0 15px rgba(220, 38, 38, 0.6); }
            .launch-btn:disabled { background: #3f3f46; border-color: #52525b; color: #71717a; cursor: not-allowed; }
        `;
        document.head.appendChild(style);

        // --- 2. Inject HTML ---
        overlay = document.createElement('div');
        overlay.id = 'intercept-modal-overlay';
        overlay.className = 'hidden';
        overlay.innerHTML = `
            <div class="intercept-modal">
                <div class="modal-header">
                    <span>TACTICAL DRONE LAUNCHER // 16-CELL</span>
                    <button class="close-btn" id="close-intercept-modal">×</button>
                </div>
                <div class="modal-body">
                    <div class="launcher-grid" id="launcher-grid"></div>
                </div>
                <div class="modal-footer">
                    <span id="selected-drone-status" style="flex-grow: 1; font-family: monospace; font-size: 13px; color: #a1a1aa;">AWAITING SELECTION...</span>
                    <button id="btn-launch-drone" class="launch-btn" disabled>LAUNCH</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        // Close events
        document.getElementById('close-intercept-modal').onclick = () => overlay.classList.add('hidden');
        overlay.onclick = (e) => { if (e.target === overlay) overlay.classList.add('hidden'); };
    }

    // --- 3. Populate / Reset Grid Logic ---
    const grid = document.getElementById('launcher-grid');
    grid.innerHTML = ''; // Clear previous
    let selectedSlot = null;
    const launchBtn = document.getElementById('btn-launch-drone');
    const statusText = document.getElementById('selected-drone-status');
    
    launchBtn.disabled = true;
    statusText.innerText = `TARGET: TRACK-${targetId} | SELECT TUBE`;

    // SVG mimicking the white-domed quadcopters in the reference images
    const droneSvg = `
        <svg class="drone-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2v4"/><path d="M12 18v4"/><path d="M4.93 4.93l2.83 2.83"/><path d="M19.07 19.07l-2.83-2.83"/><path d="M2 12h4"/><path d="M22 12h-4"/><path d="M4.93 19.07l2.83-2.83"/><path d="M19.07 4.93l-2.83 2.83"/>
            <!-- White Dome -->
            <circle cx="12" cy="12" r="4" fill="#ffffff" stroke="none"/> 
            <circle cx="12" cy="12" r="4" stroke="currentColor"/>
        </svg>`;

    // Generate the 16 slots
    for (let i = 1; i <= 16; i++) {
        const slot = document.createElement('div');
        
        // CHECK GLOBAL STATE: Is this tube marked as empty?
        const isEmpty = emptyTubes.has(i);
        
        slot.className = `drone-slot ${isEmpty ? 'empty' : 'ready'}`;
        slot.innerHTML = `
            <span class="slot-number">T${i.toString().padStart(2, '0')}</span>
            ${isEmpty ? '' : droneSvg}
        `;
        
        if (!isEmpty) {
            slot.onclick = () => {
                const prev = grid.querySelector('.selected');
                if (prev) prev.classList.remove('selected');
                
                slot.classList.add('selected');
                selectedSlot = i;
                launchBtn.disabled = false;
                statusText.innerHTML = `TARGET: TRACK-${targetId} | <span style="color:#facc15;">TUBE ${i.toString().padStart(2, '0')} READY</span>`;
            };
        }
        grid.appendChild(slot);
    }

    // --- 4. Launch Action ---
    launchBtn.onclick = () => {
        if (selectedSlot) {
            // NEW: Mark the chosen tube as permanently empty!
            emptyTubes.add(selectedSlot);
            
            overlay.classList.add('hidden');
        }
    };

    // Show the modal
    overlay.classList.remove('hidden');
}


// =====================================================================
// UTILITY FUNCTIONS
// =====================================================================

function clearSelectedTarget() {
    currentSelectedTrackId = null;
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

    // We add the text inside a dedicated span that is hidden by default
    btn.innerHTML = `${svgIcon} <span class="btn-label" style="display: none; white-space: nowrap;">${label}</span>`;
    
    // Toggle the display of the span on hover
    btn.onmouseenter = () => {
        btn.style.background = hoverBg;
        btn.querySelector('.btn-label').style.display = 'inline';
    };
    btn.onmouseleave = () => {
        btn.style.background = baseBg;
        btn.querySelector('.btn-label').style.display = 'none';
    };
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