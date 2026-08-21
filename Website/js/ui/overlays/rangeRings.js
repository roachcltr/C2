// js/ui/overlays/rangeRings.js
import { cesiumViewer, SITE_LAT, SITE_LON } from '../../core/Map.js';
import { getRingPositions } from './geoUtils.js';

const NM_TO_METERS = 1852;
const EARTH_RADIUS = 6378137.0;

// SVG Icons for the Toggle
const eyeOpen = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>`;
const eyeClosed = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/></svg>`;

export function initRangeRings(onHighlightChange) {
    // Cesium hanya dimuat di mode normal - jangan buat objek Cesium di scope modul
    // (module-level), baru buat di sini supaya aman diimport sebelum Cesium load.
    const zoomCondition = new Cesium.DistanceDisplayCondition(0.0, 50000.0);
    const toggleRingsBtn = document.getElementById('toggle-rings-btn');
    const ringSelectors = document.getElementById('ring-selectors');
    const ringButtons = document.querySelectorAll('#ring-selectors .ring-btn');

    const ringDistances = [1, 2, 5, 10, 20, 50];
    const ringEntities = {};
    const ringLabels = {};
    const ringLabels2 = {};
    const ringLabels3 = {};
    const ringLabels4 = {};

    let highlightedRing = 1;
    let ringsVisible = true;

    // 1. Generate the 3D Rings and Labels
    ringDistances.forEach(nm => {
        const radiusMeters = nm * NM_TO_METERS;
        const colorAccent = Cesium.Color.fromCssColorString('#4ade80');
        const colorDim = Cesium.Color.WHITE.withAlpha(0.3);

        // THE FIX: Use Polyline instead of Ellipse for 3D Terrain Draping
        const ringPositions = getRingPositions(SITE_LON, SITE_LAT, radiusMeters, 100); // 180 steps for smooth curves

        ringEntities[nm] = cesiumViewer.entities.add({
            id: `ring_${nm}nm`,
            polyline: {
                positions: ringPositions,
                width: 2,
                material: nm === highlightedRing ? colorAccent : colorDim,
                clampToGround: true // Drapes the line perfectly over the mountains
            }
        });

        // The Label (Positioned Due South)
        const dLat = (radiusMeters / EARTH_RADIUS) * (180 / Math.PI);
        const labelLat = SITE_LAT - dLat; // Subtracting moves it South
        const labelLon = SITE_LON + dLat; // Subtracting moves it South

        ringLabels[nm] = cesiumViewer.entities.add({
            id: `ringLabel_${nm}nm`,
            position: Cesium.Cartesian3.fromDegrees(SITE_LON, labelLat),
            label: {
                text: `${nm} NM`,
                font: 'bold 13px Segoe UI',
                fillColor: nm === highlightedRing ? colorAccent : colorDim+0.1,
                style: Cesium.LabelStyle.FILL,
                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
                distanceDisplayCondition: zoomCondition,
                pixelOffset: new Cesium.Cartesian2(0, 15) // Pushed slightly further away so it doesn't overlap the ring
            }
        });
        ringLabels2[nm] = cesiumViewer.entities.add({
            id: `ringLabel2_${nm}nm`,
            position: Cesium.Cartesian3.fromDegrees(SITE_LON, labelLat+(2*dLat)),
            label: {
                text: `${nm} NM`,
                font: 'bold 13px Segoe UI',
                fillColor: nm === highlightedRing ? colorAccent : colorDim+0.1,
                style: Cesium.LabelStyle.FILL,
                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
                distanceDisplayCondition: zoomCondition,
                pixelOffset: new Cesium.Cartesian2(0, -15) // Pushed slightly further away so it doesn't overlap the ring
            }
        });
        ringLabels3[nm] = cesiumViewer.entities.add({
            id: `ringLabel3_${nm}nm`,
            position: Cesium.Cartesian3.fromDegrees(labelLon, SITE_LAT),
            label: {
                text: `${nm} NM`,
                font: 'bold 13px Segoe UI',
                fillColor: nm === highlightedRing ? colorAccent : colorDim+0.1,
                style: Cesium.LabelStyle.FILL,
                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
                distanceDisplayCondition: zoomCondition,
                pixelOffset: new Cesium.Cartesian2(35, 0) // Pushed slightly further away so it doesn't overlap the ring
            }
        });
        ringLabels4[nm] = cesiumViewer.entities.add({
            id: `ringLabel4_${nm}nm`,
            position: Cesium.Cartesian3.fromDegrees(labelLon-(2*dLat), SITE_LAT),
            label: {
                text: `${nm} NM`,
                font: 'bold 13px Segoe UI',
                fillColor: nm === highlightedRing ? colorAccent : colorDim+0.1,
                style: Cesium.LabelStyle.FILL,
                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
                distanceDisplayCondition: zoomCondition,
                pixelOffset: new Cesium.Cartesian2(-30, 0) // Pushed slightly further away so it doesn't overlap the ring
            }
        });

    });

    // 2. Handle Master Toggle (Eye Button)
    if (toggleRingsBtn && ringSelectors) {
        toggleRingsBtn.addEventListener('click', () => {
            ringsVisible = !ringsVisible;
            // Swap SVG and CSS state
            toggleRingsBtn.innerHTML = ringsVisible ? eyeOpen : eyeClosed;
            toggleRingsBtn.classList.toggle('off', !ringsVisible);
            // Show/Hide Cesium Entities (Both rings and labels)
            ringDistances.forEach(nm => {
                ringEntities[nm].show = ringsVisible;
                ringLabels[nm].show = ringsVisible;
                ringLabels2[nm].show = ringsVisible;
                ringLabels3[nm].show = ringsVisible;
                ringLabels4[nm].show = ringsVisible;
            });
            // Dim the button panel
            ringSelectors.style.opacity = ringsVisible ? "1" : "0.3";
            ringSelectors.style.pointerEvents = ringsVisible ? "auto" : "none";
        });
    }

    // 3. Handle Highlight Selection
    ringButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            ringButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            highlightedRing = parseInt(btn.getAttribute('data-nm'));
            if (onHighlightChange) onHighlightChange();
        });
    });

    // Controller object exposing what overlaySync.js needs to repaint this overlay
    return {
        ringDistances,
        ringEntities,
        ringLabels,
        ringLabels2,
        ringLabels3,
        ringLabels4,
        getHighlightedRing: () => highlightedRing
    };
}