// js/ui/overlays/overlaySync.js

let ringsController = null;
let azimuthController = null;
let gridController = null;

export function registerOverlayControllers({ rings, azimuth, grid }) {
    ringsController = rings;
    azimuthController = azimuth;
    gridController = grid;
}

export function readOverlayThemeValues() {
    const rootStyles = getComputedStyle(document.documentElement);
    const rawRing = rootStyles.getPropertyValue('--color-rings').trim() || '#4ade80';
    const rawAzimuth = rootStyles.getPropertyValue('--color-azimuth').trim() || '#ffffff';
    const rawGrid = rootStyles.getPropertyValue('--color-grid').trim() || '#ffffff';

    const ringOp = document.getElementById('rings-opacity') ? parseFloat(document.getElementById('rings-opacity').value) : 0.3;
    const azOp = document.getElementById('azimuth-opacity') ? parseFloat(document.getElementById('azimuth-opacity').value) : 0.3;
    const gridOp = document.getElementById('grid-opacity') ? parseFloat(document.getElementById('grid-opacity').value) : 0.3;

    return { rawRing, rawAzimuth, rawGrid, ringOp, azOp, gridOp };
}

export function syncMapOverlayColors() {
    if (!ringsController || !azimuthController || !gridController) return;

    // 1. Get current slider values + live CSS variable colors
    const { rawRing, rawAzimuth, rawGrid, ringOp, azOp, gridOp } = readOverlayThemeValues();

    // 2. Repaint Rings
    const colorRingAccent = Cesium.Color.fromCssColorString(rawRing).withAlpha(ringOp);
    const colorRingDim = Cesium.Color.WHITE.withAlpha(0.15 * ringOp);
    const highlightedRing = ringsController.getHighlightedRing();
    ringsController.ringDistances.forEach(nm => {
        if (ringsController.ringEntities[nm]) {
            const targetColor = (nm === highlightedRing) ? colorRingAccent : colorRingDim;
            if (ringsController.ringEntities[nm].polyline) ringsController.ringEntities[nm].polyline.material = targetColor;
            if (ringsController.ringLabels[nm]) ringsController.ringLabels[nm].label.fillColor = targetColor;
            if (ringsController.ringLabels2[nm]) ringsController.ringLabels2[nm].label.fillColor = targetColor;
            if (ringsController.ringLabels3[nm]) ringsController.ringLabels3[nm].label.fillColor = targetColor;
            if (ringsController.ringLabels4[nm]) ringsController.ringLabels4[nm].label.fillColor = targetColor;
        }
    });

    // 3. Repaint Azimuth Lines
    const colorAzLine = Cesium.Color.fromCssColorString(rawAzimuth).withAlpha(0.9 * azOp);
    const colorAzLabel = Cesium.Color.fromCssColorString(rawAzimuth).withAlpha(azOp);

    azimuthController.entities.forEach(entity => {
        if (entity.polyline) entity.polyline.material = colorAzLine;
        if (entity.label) entity.label.fillColor = colorAzLabel;
    });

    // 4. Repaint Lat/Lon Grid
    if (gridController && typeof gridController.repaint === 'function') {
        // Use the grid's custom topographical repaint logic!
        gridController.repaint(rawGrid, gridOp);
    } 
    else if (gridController && gridController.entities) {
        // Fallback for older versions
        const colorGridLine = Cesium.Color.fromCssColorString(rawGrid).withAlpha(0.9 * gridOp);
        const colorGridLabel = Cesium.Color.fromCssColorString(rawGrid).withAlpha(gridOp);

        gridController.entities.forEach(entity => {
            if (entity.polyline) entity.polyline.material = colorGridLine;
            if (entity.label) entity.label.fillColor = colorGridLabel;
        });
    }
}

export function initOverlaySync() {
    // Attach the sync function to the opacity sliders
    const ringsOpacitySlider = document.getElementById('rings-opacity');
    const azimuthOpacitySlider = document.getElementById('azimuth-opacity');
    const gridOpacitySlider = document.getElementById('grid-opacity');
    if (ringsOpacitySlider) ringsOpacitySlider.addEventListener('input', syncMapOverlayColors);
    if (azimuthOpacitySlider) azimuthOpacitySlider.addEventListener('input', syncMapOverlayColors);
    if (gridOpacitySlider) gridOpacitySlider.addEventListener('input', syncMapOverlayColors);
}