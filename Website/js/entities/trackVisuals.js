// js/entities/trackVisuals.js
//
// Classification strings here are kept in lockstep with the values
// ThreatEngine::evaluateKinematicProfile() actually assigns to
// record.classification:
//   "FIXED_WING_HEAVY", "HIGH_SPEED_TACTICAL", "UAV", "BOGEY", "UNKNOWN_NO_DATA"
// ThreatEngine also appends " (EVASIVE)" to any of those when the maneuver
// bit is set - substring checks below still match the base type in that case.

export function getClassColor(classification) {
    if (classification.includes("FIXED_WING_HEAVY")) return Cesium.Color.BLUE;
    if (classification.includes("HIGH_SPEED_TACTICAL")) return Cesium.Color.RED;
    if (classification.includes("UAV")) return Cesium.Color.ORANGE;
    if (classification.includes("BOGEY")) return Cesium.Color.YELLOW;
    return Cesium.Color.YELLOW; // UNKNOWN_NO_DATA / anything unrecognized
}

// Sama seperti getClassColor() tapi hex string biasa - dipakai oleh Lite Mode
// (Leaflet) yang tidak punya objek Cesium.Color. Warna disamakan dengan legend
// di index.html (shape & base color).
export function getClassColorHex(classification) {
    if (classification.includes("FIXED_WING_HEAVY")) return "#3b82f6";
    if (classification.includes("HIGH_SPEED_TACTICAL")) return "#ef4444";
    if (classification.includes("UAV")) return "#f97316";
    if (classification.includes("BOGEY")) return "#eab308";
    return "#eab308";
}

function getEvasiveBadge() {
    // 1. Circle 'cx' moved from 30 to 100 to clear the text width.
    // 2. Icon translation X moved from 21 to 91 to stay centered (100 - 9 = 91).
    return `
        <circle cx="100" cy="8" r="10"
            fill="white"
            stroke="black"
            stroke-width="2"/>
        <g transform="translate(91,-1) scale(0.75)"
            fill="none"
            stroke="red"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round">
            <path d="M9 14 4 9l5-5"/>
            <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"/>
        </g>
    `;
}

export function getClassSymbol(classification, color) {
    let shape;
    const isEvasive = classification.includes("EVASIVE");

    // Base shapes are drawn inside a 32x32 area, offset by (2,2) so the
    // evasive badge (centered near 30,8) has room to sit outside them
    // without clipping, inside the shared 36x36 viewBox below.
    if (classification.includes("FIXED_WING_HEAVY")) {
        shape = `
            <polygon points="18,5 31,30 5,30"
                fill="${color}"
                stroke="black"
                stroke-width="2"/>`;
    }
    else if (classification.includes("HIGH_SPEED_TACTICAL")) {
        shape = `
            <polygon points="18,4 32,18 18,32 4,18"
                fill="${color}"
                stroke="black"
                stroke-width="2"/>`;
    }
    else if (classification.includes("UAV")) {
        shape = `
            <circle cx="18" cy="18" r="13"
                fill="${color}"
                stroke="black"
                stroke-width="2"/>`;
    }
    else {
        // BOGEY and UNKNOWN_NO_DATA share this shape, same as the original
        // default branch did.
        shape = `
            <path d="M15 5 H21 V15 H31 V21 H21 V31 H15 V21 H5 V15 H15 Z"
                fill="${color}"
                stroke="black"
                stroke-width="2"/>`;
    }

    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">
            ${shape}
            ${isEvasive ? getEvasiveBadge() : ""}
        </svg>`;

    return "data:image/svg+xml," + encodeURIComponent(svg);
}

export function formatAltitude(meters) {
    return Math.round(meters).toLocaleString('id-ID');
}