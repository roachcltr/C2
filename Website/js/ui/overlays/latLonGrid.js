// js/ui/overlays/latLonGrid.js
import { cesiumViewer, SITE_LAT, SITE_LON } from '../../core/Map.js';

const eyeOpen = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>`;
const eyeClosed = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/></svg>`;

export function initLatLonGrid() {
    const toggleGridBtn = document.getElementById('toggle-grid-btn');
    const gridSelectors = document.getElementById('grid-selectors');
    const gridButtons = document.querySelectorAll('#grid-selectors .ring-btn');
    
    // NEW: Topo Control Elements
    const toggleTopoBtn = document.getElementById('toggle-topo-btn');
    const topoElevSlider = document.getElementById('topo-max-elev');

    let gridEntities = [];
    let gridVisible = true;
    let currentGridIncrement = 0.25;
    let lastGridOp = 0.3;

    // NEW: Topo State Variables
    let topoEnabled = true;
    let currentMaxElevation = 2500.0; 

    // ==========================================
    // TOPOGRAPHICAL COLOR MATH
    // ==========================================
    function getElevationColor(height, baseColorHex, opacity) {
        const baseColor = Cesium.Color.fromCssColorString(baseColorHex);
        // If the mountain button is toggled off, just return the flat grid color
        if (!topoEnabled) {
            return baseColor.withAlpha(opacity);
        }
        // Use the dynamic slider value instead of a hardcoded 2500
        const t = Math.max(0.0, Math.min(height / currentMaxElevation, 1.0));
        let targetColor;
        // FIX: The if-statement boundaries now perfectly match the math!
        if (t < 0.333) {
            // 0% to 33% -> Fade from Base Grid Color to Yellow
            targetColor = Cesium.Color.lerp(baseColor, Cesium.Color.YELLOW, t / 0.333, new Cesium.Color());
        } else if (t < 0.666) {
            // 33% to 66% -> Fade from Yellow to Orange
            targetColor = Cesium.Color.lerp(Cesium.Color.YELLOW, Cesium.Color.ORANGE, (t - 0.333) / 0.333, new Cesium.Color());
        } else {
            // 66% to 100% -> Fade from Orange to Red
            targetColor = Cesium.Color.lerp(Cesium.Color.ORANGE, Cesium.Color.RED, (t - 0.666) / 0.334, new Cesium.Color());
        }
        return targetColor.withAlpha(opacity);
    }

    function drawGridLines(gridOp) {
        // ... (Keep your exact existing drawGridLines logic here, it naturally inherits the new getElevationColor math!) ...
        const rootStyles = getComputedStyle(document.documentElement);
        const rawGrid = rootStyles.getPropertyValue('--color-grid').trim() || '#ffffff';
        lastGridOp = gridOp;

        gridEntities.forEach(entity => cesiumViewer.entities.remove(entity));
        gridEntities = [];

        const bounds = Math.min(6.0, currentGridIncrement * 6);
        const minLat = Math.floor((SITE_LAT - bounds) / currentGridIncrement) * currentGridIncrement;
        const maxLat = Math.ceil((SITE_LAT + bounds) / currentGridIncrement) * currentGridIncrement;
        const minLon = Math.floor((SITE_LON - bounds) / currentGridIncrement) * currentGridIncrement;
        const maxLon = Math.ceil((SITE_LON + bounds) / currentGridIncrement) * currentGridIncrement;

        const labelColor = Cesium.Color.fromCssColorString(rawGrid).withAlpha(gridOp + 0.1);
        const zoomCondition = new Cesium.DistanceDisplayCondition(0.0, 50000.0);
        const segmentSize = Math.min(0.025, currentGridIncrement); 

        // Draw Latitude lines
        for (let lat = minLat; lat <= maxLat; lat += currentGridIncrement) {
            for (let lon = minLon; lon < maxLon; lon += segmentSize) {
                const nextLon = Math.min(lon + segmentSize, maxLon);
                const midCarto = Cesium.Cartographic.fromDegrees((lon + nextLon) / 2, lat);
                const height = cesiumViewer.scene.globe.getHeight(midCarto) || 0;

                const entity = cesiumViewer.entities.add({
                    show: gridVisible,
                    polyline: {
                        positions: Cesium.Cartesian3.fromDegreesArray([lon, lat, nextLon, lat]),
                        width: 1,
                        material: getElevationColor(height, rawGrid, gridOp),
                        clampToGround: true
                    }
                });
                entity.customData = { type: 'topo-line', terrainHeight: height };
                gridEntities.push(entity);
            }
        }

        // Draw Longitude lines
        for (let lon = minLon; lon <= maxLon; lon += currentGridIncrement) {
            for (let lat = minLat; lat < maxLat; lat += segmentSize) {
                const nextLat = Math.min(lat + segmentSize, maxLat);
                const midCarto = Cesium.Cartographic.fromDegrees(lon, (lat + nextLat) / 2);
                const height = cesiumViewer.scene.globe.getHeight(midCarto) || 0;

                const entity = cesiumViewer.entities.add({
                    show: gridVisible,
                    polyline: {
                        positions: Cesium.Cartesian3.fromDegreesArray([lon, lat, lon, nextLat]),
                        width: 1,
                        material: getElevationColor(height, rawGrid, gridOp),
                        clampToGround: true
                    }
                });
                entity.customData = { type: 'topo-line', terrainHeight: height };
                gridEntities.push(entity);
            }
        }

        // Draw Intersection Labels
        for (let lat = minLat; lat <= maxLat; lat += currentGridIncrement) {
            for (let lon = minLon; lon <= maxLon; lon += currentGridIncrement) {
                const latText = `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}`;
                const lonText = `${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`;

                gridEntities.push(cesiumViewer.entities.add({
                    show: gridVisible,
                    position: Cesium.Cartesian3.fromDegrees(lon, lat),
                    label: {
                        text: `${lonText}\n${latText}`,
                        font: '14px "Segoe UI", monospace',
                        fillColor: labelColor,
                        style: Cesium.LabelStyle.FILL,
                        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                        disableDepthTestDistance: Number.POSITIVE_INFINITY,
                        distanceDisplayCondition: zoomCondition,
                        pixelOffset: new Cesium.Cartesian2(-10, -10),
                        horizontalOrigin: Cesium.HorizontalOrigin.RIGHT,
                        verticalOrigin: Cesium.VerticalOrigin.BOTTOM
                    }
                }));
            }
        }
    }

    // 1. Draw flat grid immediately
    drawGridLines(0.3);

    // 2. Wait for terrain, then draw topographical
    const removeTileLoadListener = cesiumViewer.scene.globe.tileLoadProgressEvent.addEventListener((queuedTileCount) => {
        if (queuedTileCount === 0) {
            drawGridLines(lastGridOp);
            removeTileLoadListener(); 
        }
    });

    // ==========================================
    // EXPOSE TO OVERLAY SYNC MANAGER
    // ==========================================
    function repaint(rawGridHex, opacityMultiplier) {
        lastGridOp = opacityMultiplier;
        gridEntities.forEach(entity => {
            if (entity.customData && entity.customData.type === 'topo-line') {
                entity.polyline.material = getElevationColor(entity.customData.terrainHeight, rawGridHex, opacityMultiplier);
            } else if (entity.label) {
                entity.label.fillColor = Cesium.Color.fromCssColorString(rawGridHex).withAlpha(opacityMultiplier + 0.1);
            }
        });
    }

    // ==========================================
    // EVENT LISTENERS
    // ==========================================
    
    // Existing Eye Toggle & Selectors
    if (toggleGridBtn && gridSelectors) {
        toggleGridBtn.addEventListener('click', () => {
            gridVisible = !gridVisible;
            toggleGridBtn.innerHTML = gridVisible ? eyeOpen : eyeClosed;
            toggleGridBtn.classList.toggle('off', !gridVisible);

            gridEntities.forEach(entity => entity.show = gridVisible);
            gridSelectors.style.opacity = gridVisible ? "1" : "0.3";
            gridSelectors.style.pointerEvents = gridVisible ? "auto" : "none";
        });
    }

    if (gridButtons) {
        gridButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                gridButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                currentGridIncrement = parseFloat(btn.getAttribute('data-deg'));
                drawGridLines(lastGridOp);
            });
        });
    }

    // --- NEW: Topographical Listeners ---
    
    // Helper to grab the live CSS color for fast repainting
    function triggerSmartRepaint() {
        const rootStyles = getComputedStyle(document.documentElement);
        const rawGrid = rootStyles.getPropertyValue('--color-grid').trim() || '#ffffff';
        repaint(rawGrid, lastGridOp);
    }

    // Mountain Toggle Button
    if (toggleTopoBtn) {
        toggleTopoBtn.addEventListener('click', () => {
            topoEnabled = !topoEnabled;
            toggleTopoBtn.classList.toggle('off', !topoEnabled);
            triggerSmartRepaint(); // Instantly update colors without recalculating lines
        });
    }

    // Max Elevation Slider
    if (topoElevSlider) {
        topoElevSlider.addEventListener('input', (e) => {
            currentMaxElevation = parseFloat(e.target.value);
            
            // Only waste CPU cycles repainting if Topo mode is actually turned on
            if (topoEnabled) {
                triggerSmartRepaint(); 
            }
        });
    }

    return {
        get entities() { return gridEntities; },
        repaint: repaint
    };
}