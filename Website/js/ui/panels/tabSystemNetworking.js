// Tempat menulis fungsionalitas khusus Tab System
export function initSystemTab() {
    const panel = document.getElementById('panel-system-debug');
    if (!panel) return;
    
    // Ruang kosong ini bisa kamu pakai nanti jika ada tombol-tombol 
    // pengaturan tambahan di panel System & Networking
}

// ============================================================================
// FUNGSI UPDATE REAL-TIME RAW JSON
// ============================================================================
export function updateRawJsonDisplay(targetData, selectedTargetId) {
    const jsonDisplay = document.getElementById('raw-json-display');
    if (!jsonDisplay) return;

    // KUNCI PERBAIKAN: Gunakan String() untuk mencegah bentrok tipe data (Integer vs Text)
    if (targetData && String(targetData.track_id) === String(selectedTargetId)) {
        // Ubah objek JSON menjadi string dengan indentasi 2 spasi agar cantik
        const formattedJson = JSON.stringify(targetData, null, 2);
        
        // Timpa teks lama dengan data yang paling baru
        jsonDisplay.textContent = formattedJson;
    }
}

export function clearRawJsonDisplay() {
    const jsonDisplay = document.getElementById('raw-json-display');
    if (jsonDisplay) {
        jsonDisplay.textContent = "// WAITING FOR TELEMETRY STREAM...\n// [ NO TARGET SELECTED ]";
    }
}