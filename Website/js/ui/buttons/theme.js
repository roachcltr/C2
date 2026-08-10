// js/ui/buttons/theme.js
import { syncMapOverlayColors } from '../overlays/overlaySync.js';

function hexToRgba(hex, alpha) {
    hex = hex.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// 1. Define your preset dictionary here!
const themePresets = {
    "default": {
        "--strokeorborder": { hex: "#4ade80", alpha: 1.0 },
        "--hover": { hex: "#4ade80", alpha: 0.15 },
        "--glow": { hex: "#4ade80", alpha: 0.5 },
        "--panel": { hex: "#4ade80", alpha: 0.3 },
        "--header": { hex: "#4ade80", alpha: 0.05 },
        "--black": { hex: "#0a0d12", alpha: 0.6 },
        "--color-rings": { hex: "#4ade80", alpha: 1.0 },
        "--color-azimuth": { hex: "#ffffff", alpha: 1.0 },
        "--color-grid": { hex: "#ffffff", alpha: 1.0 }
    },
    "neon-green": {
        "--strokeorborder": { hex: "#4ade80", alpha: 1.0 },
        "--hover": { hex: "#4ade80", alpha: 0.15 },
        "--glow": { hex: "#4ade80", alpha: 0.5 },
        "--panel": { hex: "#4ade80", alpha: 0.3 },
        "--header": { hex: "#4ade80", alpha: 0.05 },
        "--black": { hex: "#0a0d12", alpha: 0.6 },
        "--color-rings": { hex: "#00ff00", alpha: 1.0 },    // Pure Green
        "--color-azimuth": { hex: "#00ff00", alpha: 1.0 },  // Pure Green
        "--color-grid": { hex: "#00ff00", alpha: 1.0 }      // Pure Green
    }
};

export function initTheme() {
    const themeBtn = document.getElementById('theme-btn');
    const themePopup = document.getElementById('theme-popup');
    const colorInputs = document.querySelectorAll('.theme-row input[type="color"]');

    if (!themeBtn || !themePopup) return;

    // Toggle popup
    themeBtn.addEventListener('click', () => {
        themePopup.classList.toggle('collapsed');
    });

    // Handle manual color changes
    colorInputs.forEach(input => {
        input.addEventListener('input', (e) => {
            const varName = e.target.getAttribute('data-var');
            const alpha = parseFloat(e.target.getAttribute('data-alpha'));
            const hexValue = e.target.value;

            document.documentElement.style.setProperty(varName, hexToRgba(hexValue, alpha));

            if (['--color-rings', '--color-azimuth', '--color-grid'].includes(varName)) {
                syncMapOverlayColors();
            }
        });
    });

    // 2. Helper function to apply a full preset
    function applyPreset(presetName) {
        const preset = themePresets[presetName];
        if (!preset) return;

        // Loop through all properties in the chosen preset
        Object.keys(preset).forEach(varName => {
            const { hex, alpha } = preset[varName];
            
            // Apply to CSS variables
            document.documentElement.style.setProperty(varName, hexToRgba(hex, alpha));
            
            // Visually update the HTML color pickers so they match the new theme
            const inputElement = document.querySelector(`.theme-row input[data-var="${varName}"]`);
            if (inputElement) {
                inputElement.value = hex;
            }
        });

        // Instantly repaint the 3D map
        syncMapOverlayColors();
    }

    // 3. Attach event listeners to preset buttons
    const btnDefault = document.getElementById('preset-default');
    const btnNeonGreen = document.getElementById('preset-neon-green');

    if (btnDefault) btnDefault.addEventListener('click', () => applyPreset('default'));
    if (btnNeonGreen) btnNeonGreen.addEventListener('click', () => applyPreset('neon-green'));
}