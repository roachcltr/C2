// js/core/MapRadar.js
// "Radar Mode": layar hitam polos, tanpa tile peta sama sekali. Semua track
// digambar sebagai PPI scope (bearing/range dari site) murni pakai canvas 2D,
// tidak butuh Cesium/Leaflet/internet untuk menggambar scope-nya sendiri.
import { latLonToBearingRange } from '../utils/geo.js';
import { getClassColorHex } from '../entities/trackVisuals.js';

// Harus tetap sinkron dengan SITE_LAT/SITE_LON di core/Map.js.
const SITE_LAT = -7.749786;
const SITE_LON = 108.502177;

const MAX_RANGE_NM = 20;
const MAX_RANGE_METERS = MAX_RANGE_NM * 1852;
const RING_COUNT = 4;
const SWEEP_PERIOD_MS = 4000;

let canvas, ctx;
let lastTracks = {};
let animFrame = null;

export async function initMap() {
    canvas = document.getElementById('radar-scope-canvas');
    ctx = canvas.getContext('2d');

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    renderLoop();
}

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

export function updateRadarMarkers(activeTracks) {
    lastTracks = activeTracks;
}

function center() {
    return {
        cx: canvas.width / 2,
        cy: canvas.height / 2,
        r: Math.min(canvas.width, canvas.height) * 0.45
    };
}

// bearingDeg: 0 = utara, searah jarum jam. North-up display.
function polarToXY(cx, cy, r, bearingDeg, rangeMeters) {
    const frac = Math.min(rangeMeters / MAX_RANGE_METERS, 1);
    const rad = bearingDeg * Math.PI / 180;
    return {
        x: cx + frac * r * Math.sin(rad),
        y: cy - frac * r * Math.cos(rad)
    };
}

function drawScope(cx, cy, r) {
    ctx.strokeStyle = 'rgba(10, 220, 50, 0.4)';
    ctx.fillStyle = 'rgba(10, 220, 50, 0.7)';
    ctx.font = '11px JetBrains Mono, monospace';
    ctx.lineWidth = 1;

    // Range rings
    for (let i = 1; i <= RING_COUNT; i++) {
        const ringR = (r / RING_COUNT) * i;
        ctx.beginPath();
        ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
        ctx.stroke();

        const nm = Math.round((MAX_RANGE_NM / RING_COUNT) * i);
        ctx.fillText(`${nm}NM`, cx + 4, cy - ringR + 12);
    }

    // Crosshair N-S / E-W
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx, cy + r);
    ctx.moveTo(cx - r, cy);
    ctx.lineTo(cx + r, cy);
    ctx.stroke();

    // Compass labels
    ctx.fillStyle = 'rgba(10, 220, 50, 0.9)';
    ctx.font = 'bold 13px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('N', cx, cy - r - 8);
    ctx.fillText('S', cx, cy + r + 16);
    ctx.fillText('E', cx + r + 14, cy + 4);
    ctx.fillText('W', cx - r - 14, cy + 4);
    ctx.textAlign = 'left';

    // Site marker
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fill();
}

function drawSweep(cx, cy, r, timestamp) {
    const angle = ((timestamp % SWEEP_PERIOD_MS) / SWEEP_PERIOD_MS) * Math.PI * 2;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    const sweepWidth = 0.35; // rad
    ctx.arc(cx, cy, r, angle - Math.PI / 2, angle - Math.PI / 2 + sweepWidth);
    ctx.closePath();
    ctx.fillStyle = 'rgba(10, 220, 50, 0.12)';
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + r * Math.cos(angle - Math.PI / 2), cy + r * Math.sin(angle - Math.PI / 2));
    ctx.strokeStyle = 'rgba(10, 220, 50, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
}

function drawTrack(cx, cy, r, track) {
    const geo = track.tactical_data?.geospatial;
    if (!geo) return;

    const classification = track.tactical_data?.classification || 'UNKNOWN';
    const altFt = track.raw_asterix?.altitude?.alt_ft || 0;
    const headingDeg = track.raw_asterix?.velocity?.hdg_deg || 0;
    const isEvasive = track.is_evasive || classification.includes('EVASIVE');

    const { bearingDeg, rangeMeters } = latLonToBearingRange(SITE_LAT, SITE_LON, geo.lat, geo.lon);
    if (rangeMeters > MAX_RANGE_METERS) return;

    const { x, y } = polarToXY(cx, cy, r, bearingDeg, rangeMeters);
    const color = getClassColorHex(classification);

    // Heading vector
    const headRad = headingDeg * Math.PI / 180;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 14 * Math.sin(headRad), y - 14 * Math.cos(headRad));
    ctx.stroke();

    // Track symbol
    ctx.fillStyle = color;
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    if (isEvasive) {
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, 8, 0, Math.PI * 2);
        ctx.stroke();
    }

    // Label
    ctx.fillStyle = '#ffffff';
    ctx.font = '11px JetBrains Mono, monospace';
    ctx.fillText(`TRK-${track.track_id ?? ''}`, x + 8, y - 6);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText(`${Math.round(altFt)}ft`, x + 8, y + 8);
}

function renderLoop(timestamp = 0) {
    if (!ctx) return;

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const { cx, cy, r } = center();
    drawSweep(cx, cy, r, timestamp);
    drawScope(cx, cy, r);

    for (const track of Object.values(lastTracks)) {
        drawTrack(cx, cy, r, track);
    }

    animFrame = requestAnimationFrame(renderLoop);
}
