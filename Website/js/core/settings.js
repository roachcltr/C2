// js/core/settings.js
// Lite Mode: deteksi device low-spec dan simpan preferensi user.

const STORAGE_KEY = 'c2_lite_mode';

export function hasWebGL() {
    try {
        const canvas = document.createElement('canvas');
        return !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
    } catch (e) {
        return false;
    }
}

export function isLowSpecDevice() {
    const lowCpu = (navigator.hardwareConcurrency || 4) <= 2;
    const lowMem = navigator.deviceMemory ? navigator.deviceMemory <= 4 : false;
    return lowCpu && lowMem;
}

// Tanpa WebGL, Cesium tidak bisa jalan sama sekali - Lite Mode wajib aktif.
export function isLiteModeForced() {
    return !hasWebGL();
}

export function getLiteModePreference() {
    if (isLiteModeForced()) return true;

    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'on') return true;
    if (stored === 'off') return false;

    // Belum ada preferensi tersimpan -> pakai hasil auto-detect.
    return isLowSpecDevice();
}

export function setLiteModePreference(enabled) {
    localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
}

export function applyLiteModeClass(enabled) {
    document.body.classList.toggle('lite-mode', enabled);
}

export function isLiteModeActive() {
    return document.body.classList.contains('lite-mode');
}

// ==========================================
// Radar (Scope) Mode: layar hitam fokus track, tanpa peta sama sekali.
// Independen dari Lite Mode - kalau aktif, override tampilan peta apapun.
// ==========================================
const RADAR_STORAGE_KEY = 'c2_radar_mode';

export function getRadarModePreference() {
    return localStorage.getItem(RADAR_STORAGE_KEY) === 'on';
}

export function setRadarModePreference(enabled) {
    localStorage.setItem(RADAR_STORAGE_KEY, enabled ? 'on' : 'off');
}

export function applyRadarModeClass(enabled) {
    document.body.classList.toggle('radar-mode', enabled);
}

export function isRadarModeActive() {
    return document.body.classList.contains('radar-mode');
}
