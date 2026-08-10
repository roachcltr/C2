// js/ui/overlays/mapAppearance.js
import { cesiumViewer } from '../../core/Map.js';

export function initMapAppearance() {
    const brightnessSlider = document.getElementById('map-brightness');
    const saturationSlider = document.getElementById('map-saturation');

    if (brightnessSlider && cesiumViewer) {
        brightnessSlider.addEventListener('input', (e) => {
            const baseLayer = cesiumViewer.scene.imageryLayers.get(0);
            if (baseLayer) {
                baseLayer.brightness = parseFloat(e.target.value);
            }
        });
    }

    if (saturationSlider && cesiumViewer) {
        saturationSlider.addEventListener('input', (e) => {
            const baseLayer = cesiumViewer.scene.imageryLayers.get(0);
            if (baseLayer) {
                baseLayer.saturation = parseFloat(e.target.value);
            }
        });
    }
}