// js/ui/buttons/liteMode.js
import { getLiteModePreference, setLiteModePreference, isLiteModeForced } from '../../core/settings.js';

// Ikon mata buka/tutup - pola yang sama dipakai toggle overlay lain
// (lihat rangeRings.js) supaya feedback visualnya konsisten.
const eyeOpen = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>`;
const eyeClosed = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/></svg>`;

function paintState(btn, active) {
    btn.classList.toggle('off', !active);
    btn.innerHTML = active ? eyeOpen : eyeClosed;
}

export function initLiteModeToggle() {
    const btn = document.getElementById('toggle-lite-mode-btn');
    const forcedBadge = document.getElementById('lite-mode-forced-badge');
    if (!btn) return;

    const forced = isLiteModeForced();
    let active = getLiteModePreference();

    paintState(btn, active);

    if (forced) {
        // Tanpa WebGL, Lite Mode wajib aktif - kunci toggle-nya.
        btn.style.pointerEvents = 'none';
        btn.style.opacity = '0.5';
        btn.title = 'Lite Mode dipaksa aktif: browser/device ini tidak mendukung WebGL';
        if (forcedBadge) forcedBadge.style.display = 'inline';
        return;
    }

    btn.addEventListener('click', () => {
        active = !active;
        paintState(btn, active);
        setLiteModePreference(active);

        // Map engine (Cesium/Leaflet) hanya diinisialisasi sekali saat load,
        // jadi perubahan penuh baru berlaku setelah reload. Beri jeda singkat
        // supaya user melihat toggle-nya benar-benar berubah dulu.
        setTimeout(() => window.location.reload(), 180);
    });
}
