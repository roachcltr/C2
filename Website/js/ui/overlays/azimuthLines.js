// js/ui/overlays/azimuthLines.js
import { cesiumViewer, SITE_LAT, SITE_LON } from '../../core/Map.js';

const NM_TO_METERS = 1852;
const EARTH_RADIUS = 6378137.0;

const eyeOpen = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>`;
const eyeClosed = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/></svg>`;
const zoomCondition = new Cesium.DistanceDisplayCondition(0.0, 50000.0);

// ringDistances is needed to draw label intersections at each ring radius.
export function initAzimuthLines(ringDistances) {
    const toggleAzimuthBtn = document.getElementById('toggle-azimuth-btn');
    const azimuthSelectors = document.getElementById('azimuth-selectors');
    const azimuthButtons = document.querySelectorAll('#azimuth-selectors .ring-btn');

    let azimuthEntities = [];
    let azimuthVisible = true;
    let currentAzimuthIncrement = 30; 
    const maxAzimuthRadius = 50 * NM_TO_METERS;
    const siteLatRad = SITE_LAT * (Math.PI / 180.0);

    // Function to generate and draw the lines dynamically
    function drawAzimuthLines() {
        // 1. Read the live theme color and opacity directly from the DOM!
        const rootStyles = getComputedStyle(document.documentElement);
        const rawAzimuth = rootStyles.getPropertyValue('--color-azimuth').trim() || '#ffffff';
        const opacitySlider = document.getElementById('azimuth-opacity');
        const azOp = opacitySlider ? parseFloat(opacitySlider.value) : 0.3;

        // 2. Clear any existing lines/labels from the map
        azimuthEntities.forEach(entity => cesiumViewer.entities.remove(entity));
        azimuthEntities = [];

        // 3. Calculate and draw based on the current increment
        for (let az = 0; az < 360; az += currentAzimuthIncrement) {
            const angleRad = (90 - az) * (Math.PI / 180.0);
            const dx = maxAzimuthRadius * Math.cos(angleRad);
            const dy = maxAzimuthRadius * Math.sin(angleRad);

            const dLat = (dy / EARTH_RADIUS) * (180.0 / Math.PI);
            const dLon = (dx / (EARTH_RADIUS * Math.cos(siteLatRad))) * (180.0 / Math.PI);

            const endLon = SITE_LON + dLon;
            const endLat = SITE_LAT + dLat;

            // Line Entity
            const lineEntity = cesiumViewer.entities.add({
                id: `azimuthLine_${az}_${Date.now()}`, 
                show: azimuthVisible,
                polyline: {
                    positions: Cesium.Cartesian3.fromDegreesArray([SITE_LON, SITE_LAT, endLon, endLat]),
                    width: 1,
                    material: Cesium.Color.fromCssColorString(rawAzimuth).withAlpha(0.9 * azOp), // Sync line alpha math
                    clampToGround: true
                }
            });
            azimuthEntities.push(lineEntity);

            // Label Entities
            const labelText = az === 0 ? '360°' : az.toString().padStart(3) + '°';
            const azRad = az * (Math.PI / 180.0);
            const pixelOffsetX = -Math.sin(azRad) * 16;
            const pixelOffsetY = Math.cos(azRad) * 16;

            ringDistances.forEach(nm => {
                const radiusMeters = nm * NM_TO_METERS;
                const ringDx = radiusMeters * Math.cos(angleRad);
                const ringDy = radiusMeters * Math.sin(angleRad);

                const ringDLat = (ringDy / EARTH_RADIUS) * (180.0 / Math.PI);
                const ringDLon = (ringDx / (EARTH_RADIUS * Math.cos(siteLatRad))) * (180.0 / Math.PI);

                const labelEntity = cesiumViewer.entities.add({
                    id: `azimuthLabel_${az}_${nm}nm_${Date.now()}`,
                    show: azimuthVisible,
                    position: Cesium.Cartesian3.fromDegrees(SITE_LON + ringDLon, SITE_LAT + ringDLat),
                    label: {
                        text: labelText,
                        font: '12px "Segoe UI", monospace', 
                        fillColor: Cesium.Color.fromCssColorString(rawAzimuth).withAlpha(azOp), // Sync label alpha math
                        style: Cesium.LabelStyle.FILL,
                        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                        disableDepthTestDistance: Number.POSITIVE_INFINITY,
                        distanceDisplayCondition: zoomCondition,
                        pixelOffset: new Cesium.Cartesian2(pixelOffsetX, pixelOffsetY)
                    }
                });
                azimuthEntities.push(labelEntity);
            });
        }
    }

    // Draw them for the first time on startup
    drawAzimuthLines();

    // 3. Handle the Eye Toggle Button
    if (toggleAzimuthBtn && azimuthSelectors) {
        toggleAzimuthBtn.addEventListener('click', () => {
            azimuthVisible = !azimuthVisible;
            toggleAzimuthBtn.innerHTML = azimuthVisible ? eyeOpen : eyeClosed;
            toggleAzimuthBtn.classList.toggle('off', !azimuthVisible);

            azimuthEntities.forEach(entity => {
                entity.show = azimuthVisible;
            });

            azimuthSelectors.style.opacity = azimuthVisible ? "1" : "0.3";
            azimuthSelectors.style.pointerEvents = azimuthVisible ? "auto" : "none";
        });
    }

    // 4. Handle Increment Selection
    if (azimuthButtons) {
        azimuthButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                azimuthButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                currentAzimuthIncrement = parseInt(btn.getAttribute('data-deg'));
                // No longer need to pass variables, it figures it out automatically!
                drawAzimuthLines(); 
            });
        });
    }

    return {
        get entities() { return azimuthEntities; }
    };
}