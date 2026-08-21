// js/ui/UI.js
import { initMapPanels } from './panels/tabMap.js';
import { initResetView } from './buttons/resetView.js';
import { SidebarTabs } from './panels/tabIndex.js';
import { initHardwareTab } from './panels/tabHardware.js';
import { initFullscreenControl } from './buttons/fullscreenControl.js';
import { initBaseView } from './buttons/baseView.js';
import { initCompass } from './buttons/compass.js';
import { initTheme } from './buttons/theme.js';
import { initLiteModeToggle } from './buttons/liteMode.js';
import { initRadarModeToggle } from './buttons/radarMode.js';
import { isLiteModeActive, isRadarModeActive } from '../core/settings.js';
import { initRangeRings } from './overlays/rangeRings.js';
import { initAzimuthLines } from './overlays/azimuthLines.js';
import { initLatLonGrid } from './overlays/latLonGrid.js';
import { initMapAppearance } from './overlays/mapAppearance.js';
import { initTrackPopup } from '../entities/trackPopup.js';
import {
    registerOverlayControllers,
    syncMapOverlayColors,
    initOverlaySync
} from './overlays/overlaySync.js';

// Bagian UI yang TIDAK butuh peta (Cesium/Leaflet) sudah siap - aman dipanggil
// segera saat halaman load, supaya sidebar/tab tetap responsif walau peta
// gagal/lambat load (network, CORS, dsb).
export function initUI() {
    initFullscreenControl();
    initTheme();
    initLiteModeToggle();
    initRadarModeToggle();
    initMapPanels();
    new SidebarTabs();
    initHardwareTab();
}

// Bagian UI yang butuh cesiumViewer sudah terbentuk (baseView.js, trackPopup.js
// membaca cesiumViewer.scene tanpa null-check) - hanya dipanggil setelah
// initMap() (mode normal) berhasil resolve. Lite Mode (Leaflet) dan Radar Mode
// (canvas polos) tidak memakai semua ini.
export function initMapDependentUI() {
    if (isLiteModeActive() || isRadarModeActive()) return;

    initBaseView();
    initResetView();
    initCompass();
    initTrackPopup();

    // Azimuth lines draw labels at each ring's radius, so rings must init first
    // and hand off its distances list.
    const rings = initRangeRings(() => syncMapOverlayColors());
    const azimuth = initAzimuthLines(rings.ringDistances);
    const grid = initLatLonGrid();

    registerOverlayControllers({ rings, azimuth, grid });
    initOverlaySync();

    // Repaint all three overlays once with the live theme colors/opacity,
    // since each overlay module draws with its own defaults on init.
    syncMapOverlayColors();

    initMapAppearance();
}
