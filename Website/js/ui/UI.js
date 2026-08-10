// js/ui/UI.js
import { initMapPanels } from './panels/tabMap.js';
import { initResetView } from './buttons/resetView.js';
import { SidebarTabs } from './panels/tabIndex.js';
import { initHardwareTab } from './panels/tabHardware.js';
import { initFullscreenControl } from './buttons/fullscreenControl.js';
import { initBaseView } from './buttons/baseView.js';
import { initCompass } from './buttons/compass.js';
import { initTheme } from './buttons/theme.js';
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

export function initUI() {
    // ==========================================
    // BUTTONS
    // ==========================================
    initFullscreenControl();
    initBaseView();
    initResetView();
    initTheme();
    initCompass();
    initTrackPopup();

    // ==========================================
    // PANELS
    // ==========================================
    initMapPanels();
    const sidebarTabs = new SidebarTabs();
    initHardwareTab();

    // ==========================================
    // OVERLAYS (rings -> azimuth -> grid, then wire sync)
    // ==========================================
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

    // ==========================================
    // MAP APPEARANCE (Brightness/Saturation)
    // ==========================================
    initMapAppearance();
}