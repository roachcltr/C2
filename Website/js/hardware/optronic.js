// js/ui/panels/hardware/optronic.js

import { setHardwareStatus } from '../../js/ui/panels/tabHardware.js';

let videoPlayer = null;
let controlWs = null;
let peerConnection = null;

export function initOptronic() {
    // ==========================================
    // 1. UI: PANEL KAMERA MELUNCUR
    // ==========================================
    const btnOpenCamera = document.getElementById('btn-open-camera');
    const closeCameraBtn = document.getElementById('close-camera-btn');
    const minimizeCameraBtn = document.getElementById('minimize-camera-btn');
    const maximizeCameraBtn = document.getElementById('maximize-camera-btn');
    const cameraPanel = document.getElementById('right-camera-panel');

    if (btnOpenCamera && cameraPanel) {
        btnOpenCamera.addEventListener('click', () => {
            cameraPanel.classList.remove('closed');
            setHardwareStatus('optronic', true);
            startVideoFeed();
            connectControlSocket();
        });

        if (closeCameraBtn) {
            closeCameraBtn.addEventListener('click', () => {
                cameraPanel.classList.add('closed');
                setHardwareStatus('optronic', false);
                stopVideoFeed();
                disconnectControlSocket();
                
                setTimeout(() => {
                    cameraPanel.classList.remove('maximized', 'minimized');
                }, 400); 
            });
        }

        if (minimizeCameraBtn) {
            minimizeCameraBtn.addEventListener('click', () => {
                cameraPanel.classList.toggle('minimized');
                if (cameraPanel.classList.contains('minimized')) {
                    cameraPanel.classList.remove('maximized');
                }
            });
        }

        if (maximizeCameraBtn) {
            maximizeCameraBtn.addEventListener('click', () => {
                // KUNCI FIX: Cek spesifik apakah panel kamera yang sedang fullscreen, bukan elemen lain
                if (document.fullscreenElement !== cameraPanel) {
                    // Paksa masuk/pindah ke native fullscreen khusus untuk cameraPanel
                    if (cameraPanel.requestFullscreen) {
                        cameraPanel.requestFullscreen();
                    } else if (cameraPanel.webkitRequestFullscreen) { /* Safari */
                        cameraPanel.webkitRequestFullscreen();
                    } else if (cameraPanel.msRequestFullscreen) { /* IE11 */
                        cameraPanel.msRequestFullscreen();
                    }
                } else {
                    // Jika cameraPanel sudah fullscreen, maka keluar
                    if (document.exitFullscreen) {
                        document.exitFullscreen();
                    }
                }
            });
        }

        // Event Listener untuk mendeteksi kapan layar berubah menjadi fullscreen
        document.addEventListener('fullscreenchange', () => {
            if (document.fullscreenElement === cameraPanel) {
                // Saat masuk fullscreen, tambahkan class maximized agar CSS HUD merata ke samping
                cameraPanel.classList.add('maximized');
                cameraPanel.classList.remove('minimized');
            } else {
                // Saat keluar dari fullscreen (misal user tekan ESC), hapus classnya
                cameraPanel.classList.remove('maximized');
            }
        });
    }

    // Initialize the HUD buttons
    initOptronicControls();

    // Initialize keyboard hooks
    initKeyboardControls();

    // --- EVENT LISTENER UNTUK SLIDE-OUT TRACKLIST ---
    const tracklistBtn = document.getElementById('tracklist-toggle-btn');
    const tracklistSidebar = document.getElementById('tracklist-sidebar');
    if (tracklistBtn && tracklistSidebar) {
        tracklistBtn.addEventListener('click', () => {
            tracklistSidebar.classList.toggle('collapsed');
            tracklistBtn.classList.toggle('active');
        });
    }
} // <-- Penutup kurung fungsi initOptronic() HARUS berada di paling bawah sini

// ==========================================
// 2. VIDEO STREAM (MediaMTX Iframe & Overlay)
// ==========================================
function startVideoFeed() {
    const iframe = document.getElementById('optronic-stream');
    const overlay = document.getElementById('video-overlay');
    if (!iframe || !overlay) return;

    // Use MediaMTX's built-in player with URL parameters to hide controls and force autoplay
    const streamUrl = `http://${window.location.hostname}:8889/live/viewpro/?autoplay=true&muted=true&controls=false`;

    if (iframe.src !== streamUrl) {
        console.log("[OPTRONIC] Loading MediaMTX internal WebRTC player...");
        iframe.src = streamUrl;
    }

    // --- Video Click-to-Track Logic ---
    // Bind the click listener to the transparent OVERLAY, not the video
    if (!overlay.dataset.clickBound) {
        overlay.addEventListener('click', (e) => {
            const rect = overlay.getBoundingClientRect();
            
            // Calculate where the user clicked as a percentage (0.0 to 1.0)
            const xPct = (e.clientX - rect.left) / rect.width;
            const yPct = (e.clientY - rect.top) / rect.height;

            // INVERT the axes to match the gimbal's hardware coordinate system
            const dx = Math.round((xPct * 1920) - 960);
            const dy = -Math.round((yPct * 1080) - 540);
            
            sendOptronicCommand(`POINT_TRACK:${dx},${dy}`);
            console.log(`[OPTRONIC] Point Tracking sent -> Offset X: ${dx}, Y: ${dy}`);
        });
        overlay.dataset.clickBound = "true";
    }
}

function stopVideoFeed() {
    const iframe = document.getElementById('optronic-stream');
    if (iframe) {
        // Clearing the source instantly kills the internal WebRTC connection
        iframe.src = '';
        console.log("[OPTRONIC] Video stream stopped to save bandwidth.");
    }
}

// ==========================================
// 3. HARDWARE CONTROL WEBSOCKET
// ==========================================
function connectControlSocket() {
    if (controlWs && controlWs.readyState !== WebSocket.CLOSED) return;

    const controlUrl = `ws://${window.location.hostname}:9003/control`;
    controlWs = new WebSocket(controlUrl);
    
    controlWs.onopen = () => {
        console.log("[OPTRONIC] Control WebSocket connected to Backend.");
        
        // --- SAFE STATE INITIALIZATION ---
        // Sinkronisasi paksa hardware dengan tampilan default UI
        setTimeout(() => {
            sendOptronicCommand('LASER_STOP'); // Matikan laser yang mungkin masih nyala
            sendOptronicCommand('STOP');       // Hentikan pergerakan/patroli
            sendOptronicCommand('VL');         // Pastikan mode sensor kembali ke VL
            console.log("[OPTRONIC] Safe State Initialization Commands Sent.");
        }, 500); // Jeda 0.5 detik untuk memastikan koneksi stabil sebelum menembak
    };

    controlWs.onerror = (err) => {
        console.error("[OPTRONIC] Control WebSocket error:", err);
    };

    controlWs.onclose = () => {
        console.warn("[OPTRONIC] Control WebSocket disconnected.");
    };

    // ==========================================
    // MENERIMA DATA DARI BACKEND
    // ==========================================
    controlWs.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            
            // Tangkap data telemetry pelacakan resmi dari kamera Optronic
            if (data.type === 'optronic_track') {
                updateBoundingBox(data);
            } 
            // Tangkap data "Calon Target" dari detector.py (OpenCV)
            else if (data.type === 'AVAILABLE_TARGETS') {
                updateCandidateTargets(data);
            }
        } catch (e) {
            // Abaikan pesan jika bukan format JSON
        }
    };
}

function disconnectControlSocket() {
    if (controlWs) {
        controlWs.close();
        controlWs = null;
    }
}

// ==========================================
// FUNGSI MENGGAMBAR AI BOUNDING BOX
// ==========================================
let trackingTimeout = null;

function updateBoundingBox(data) {
    const overlay = document.getElementById('video-overlay');
    if (!overlay) return;

    // Jika status pelacakan bukan 1 (Stable) atau 2 (Coasting/Memory), sembunyikan kotak
    if (data.status !== 1 && data.status !== 2) {
        hideBoundingBox();
        return;
    }

    // Cari elemen kotak target, jika belum ada di dalam overlay, buat baru
    let box = document.getElementById('optronic-bbox');
    if (!box) {
        box = document.createElement('div');
        box.id = 'optronic-bbox';
        box.className = 'ai-target-box'; // Memanggil class CSS hijau menyala yang sudah kamu siapkan
        
        const label = document.createElement('div');
        label.className = 'ai-target-label';
        label.id = 'optronic-bbox-label';
        box.appendChild(label);
        
        overlay.appendChild(box);
    }

    // Resolusi sensor matriks Optronic asli (menurut sistem koordinatnya)
    const CAM_W = 1920;
    const CAM_H = 1080;

    // Kalkulasi titik tengah target (Kamera memposisikan 0,0 pas di tengah layar)
    // miss_az positif = melenceng ke kanan, miss_pitch positif = melenceng ke atas
    const cx = (CAM_W / 2) + data.miss_az;
    const cy = (CAM_H / 2) - data.miss_pitch; 

    // Ubah nilai koordinat piksel menjadi PERSENTASE (%)
    // Rahasia agar kotak tetap nempel akurat walaupun iframe video di-resize
    const leftPct = ((cx - (data.width / 2)) / CAM_W) * 100;
    const topPct = ((cy - (data.height / 2)) / CAM_H) * 100;
    const widthPct = (data.width / CAM_W) * 100;
    const heightPct = (data.height / CAM_H) * 100;

    box.style.left = `${leftPct}%`;
    box.style.top = `${topPct}%`;
    box.style.width = `${widthPct}%`;
    box.style.height = `${heightPct}%`;
    box.style.display = 'block';

    // Update Teks Label di atas kotak (Status Pelacakan & Tipe Target)
    const labelEl = document.getElementById('optronic-bbox-label');
    if (labelEl) {
        const statusTxt = data.status === 1 ? 'TRK' : 'MEM';
        labelEl.textContent = `${statusTxt} | TYPE:${data.target_type}`;
    }

    // Perlindungan anti-ghosting: Hilangkan kotak jika tidak ada data baru selama 1 detik (kamera mati/terputus)
    if (trackingTimeout) clearTimeout(trackingTimeout);
    trackingTimeout = setTimeout(hideBoundingBox, 1000);
}

function hideBoundingBox() {
    const box = document.getElementById('optronic-bbox');
    if (box) box.style.display = 'none';
}

// ==========================================
// FUNGSI MENGGAMBAR CALON TARGET DARI OPENCV
// ==========================================
export let candidateList = [];
export let selectedCandidateIndex = 0;
let candidateTimeout = null;

function updateCandidateTargets(data) {
    const overlay = document.getElementById('video-overlay');
    if (!overlay) return;

    // Pencegah Penumpukan: Jika kamera sudah mengunci target (kotak HUD menyala), jangan gambar yang kuning
    const trackingBox = document.getElementById('optronic-bbox');
    if (trackingBox && trackingBox.style.display === 'block') {
        candidateList = [];
        renderCandidateUI();
        return; 
    }

    // Jika tidak ada target terdeteksi
    if (data.count === 0 || !data.targets || data.targets.length === 0) {
        candidateList = [];
        renderCandidateUI();
        return;
    }

    candidateList = data.targets;
    // Jaga agar index seleksi tidak kelewatan jika jumlah target di layar tiba-tiba berkurang
    if (selectedCandidateIndex >= candidateList.length) {
        selectedCandidateIndex = 0;
    }

    renderCandidateUI();

    // Timer perlindungan: Hilangkan elemen jika detector.py terputus/target hilang
    if (candidateTimeout) clearTimeout(candidateTimeout);
    candidateTimeout = setTimeout(() => {
        candidateList = [];
        renderCandidateUI();
    }, 1000);
}

// Fungsi khusus untuk menggambar ulang UI berdasarkan target yang DIPILIH (Selected)
function renderCandidateUI() {
    const overlay = document.getElementById('video-overlay');
    const tableContainer = document.getElementById('ai-table-container');
    const countBadge = document.getElementById('tracklist-count'); // Dapatkan lencana angka
    
    // 1. Bersihkan UI Lama
    document.querySelectorAll('.candidate-target-box').forEach(el => el.remove());
    
    // Update Lencana Angka Jumlah Target
    if (countBadge) {
        countBadge.textContent = candidateList.length;
    }

    if (candidateList.length === 0) {
        // Tampilkan teks abu-abu elegan saat tidak ada target
        if (tableContainer) {
            tableContainer.innerHTML = `<div style="text-align:center; margin-top:20px; color:#8ba2b5; font-size:11px;">NO TARGETS DETECTED</div>`;
        }
        return;
    }

    // Ambil HANYA target yang sedang dipilih oleh operator
    const target = candidateList[selectedCandidateIndex];
    const CAM_W = 1920;
    const CAM_H = 1080;

    // 2. Gambar KOTAK KUNING HANYA UNTUK TARGET YANG DIPILIH
    const box = document.createElement('div');
    box.className = 'candidate-target-box';
    
    const leftPct = ((target.ui_x - (target.width / 2)) / CAM_W) * 100;
    const topPct = ((target.ui_y - (target.height / 2)) / CAM_H) * 100;
    const widthPct = (target.width / CAM_W) * 100;
    const heightPct = (target.height / CAM_H) * 100;

    box.style.position = 'absolute';
    box.style.border = '3px dashed #ffeb3b'; // Lebih tebal agar jelas
    box.style.boxSizing = 'border-box';
    box.style.pointerEvents = 'none'; 
    box.style.left = `${leftPct}%`;
    box.style.top = `${topPct}%`;
    box.style.width = `${widthPct}%`;
    box.style.height = `${heightPct}%`;
    box.style.zIndex = '9';
    box.style.boxShadow = '0 0 10px rgba(255, 235, 59, 0.5)'; // Efek bercahaya

    const label = document.createElement('div');
    // Menampilkan urutan target (Contoh: [1/3] PRESS Y TO TRACK)
    label.innerHTML = `[${selectedCandidateIndex + 1}/${candidateList.length}] PRESS 'Y' TO TRACK`;
    label.style.position = 'absolute';
    label.style.top = '-22px';
    label.style.left = '-3px';
    label.style.background = '#ffeb3b';
    label.style.color = '#000';
    label.style.fontSize = '11px';
    label.style.fontWeight = 'bold';
    label.style.padding = '2px 6px';
    
    box.appendChild(label);
    overlay.appendChild(box);

    // 3. SUSUN BARIS TABEL (BERI WARNA TERANG PADA BARIS YANG DIPILIH)
    let tbodyHtml = '';
    candidateList.forEach((t, index) => {
        const isSelected = (index === selectedCandidateIndex);
        const rowStyle = isSelected ? 'background: rgba(255, 235, 59, 0.2); font-weight: bold;' : '';
        const btnStyle = isSelected ? 'background: #ffeb3b; color: #000;' : '';
        
        tbodyHtml += `
            <tr style="${rowStyle}">
                <td>${t.id} ${isSelected ? '⬅️' : ''}</td>
                <td>${t.gimbal_dx}, ${t.gimbal_dy}</td>
                <td>${t.width}x${t.height}</td>
                <td><button class="lock-btn" data-dx="${t.gimbal_dx}" data-dy="${t.gimbal_dy}" style="${btnStyle}">TRACK</button></td>
            </tr>
        `;
    });

    // 4. RENDER TABEL
    if (tableContainer) {
        tableContainer.innerHTML = `
            <table class="tgt-table">
                <thead>
                    <tr><th>ID</th><th>Offset (px)</th><th>Ukuran</th><th></th></tr>
                </thead>
                <tbody>${tbodyHtml}</tbody>
            </table>
        `;

        // Bikin tombol 'TRACK' bisa diklik manual pakai mouse
        tableContainer.querySelectorAll('.lock-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const dx = e.target.getAttribute('data-dx');
                const dy = e.target.getAttribute('data-dy');
                sendOptronicCommand(`POINT_TRACK:${dx},${dy}`);
                candidateList = [];
                renderCandidateUI();
            });
        });
    }

    // --- FITUR BARU: AUTO-OPEN SIDEBAR SAAT ADA TARGET ---
    const tracklistSidebar = document.getElementById('tracklist-sidebar');
    const tracklistBtn = document.getElementById('tracklist-toggle-btn');
    if (tracklistSidebar && tracklistSidebar.classList.contains('collapsed')) {
        tracklistSidebar.classList.remove('collapsed');
        if (tracklistBtn) tracklistBtn.classList.add('active');
    }
}

export function sendOptronicCommand(actionStr) {
    if (controlWs && controlWs.readyState === WebSocket.OPEN) {
        controlWs.send(actionStr);
        console.log(`[OPTRONIC] Sent Command: ${actionStr}`);
    } else {
        console.warn(`[OPTRONIC] Cannot send '${actionStr}', WebSocket is offline.`);
    }
}

// ==========================================
// 4. BINDING HUD BUTTONS (DATA ATTRIBUTES)
// ==========================================
function initOptronicControls() {
    const hudPanel = document.querySelector('.hud-overlay');
    if (!hudPanel) return;

    // Fungsi kecil untuk mematikan lampu tombol Patrol jika sedang menyala
    const turnOffPatrolUI = () => {
        const patrolBtn = hudPanel.querySelector('[data-cmd-on="PATROL"]');
        if (patrolBtn && patrolBtn.classList.contains('active')) {
            patrolBtn.classList.remove('active');
        }
    };

    // --- A. Single Click Buttons (.opt-cmd) ---
    const cmdButtons = hudPanel.querySelectorAll('.opt-cmd');
    cmdButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const cmd = btn.getAttribute('data-cmd');
            
            if (cmd) {
                sendOptronicCommand(cmd);
                
                // Kalau klik Center, Lock, atau Untrack, matikan lampu Patrol!
                if (['CENTER', 'LOCK', 'UNTRACK'].includes(cmd)) {
                    turnOffPatrolUI();
                }
            }

            // Logika "Radio Button" khusus untuk Mode Kamera
            if (btn.classList.contains('opt-mode')) {
                // Matikan semua tombol mode yang ada
                hudPanel.querySelectorAll('.opt-mode').forEach(b => b.classList.remove('active'));
                // Nyalakan tombol yang baru saja diklik
                btn.classList.add('active');
            }
        });
    });

    // --- B. Hold-to-Activate Buttons (.opt-hold) ---
    const holdButtons = hudPanel.querySelectorAll('.opt-hold');
    holdButtons.forEach(btn => {
        const cmdStart = btn.getAttribute('data-cmd-start');
        const cmdStop = btn.getAttribute('data-cmd-stop');
        
        let holdInterval = null;
        let isPressed = false;

        const startAction = (e) => {
            e.preventDefault(); 
            if (isPressed) return; 
            isPressed = true;

            // Matikan lampu tombol Patrol seketika saat D-Pad ditekan!
            turnOffPatrolUI();

            if (cmdStart) {
                sendOptronicCommand(cmdStart);
                holdInterval = setInterval(() => {
                    sendOptronicCommand(cmdStart);
                }, 150); 
            }
        };

        const stopAction = (e) => {
            e.preventDefault();
            if (!isPressed) return; 
            isPressed = false;

            if (holdInterval) {
                clearInterval(holdInterval);
                holdInterval = null;
            }

            if (cmdStop) {
                sendOptronicCommand(cmdStop);
            }
        };

        // Mouse Events
        btn.addEventListener('mousedown', startAction);
        btn.addEventListener('mouseup', stopAction);
        btn.addEventListener('mouseleave', stopAction);

        // Touchscreen Events
        btn.addEventListener('touchstart', startAction, { passive: false });
        btn.addEventListener('touchend', stopAction);
        btn.addEventListener('touchcancel', stopAction);
    });

    // --- C. Toggle ON/OFF Buttons (.opt-toggle) ---
    const toggleButtons = hudPanel.querySelectorAll('.opt-toggle');
    toggleButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const isActive = btn.classList.contains('active');
            const cmdOn = btn.getAttribute('data-cmd-on');
            const cmdOff = btn.getAttribute('data-cmd-off');

            if (isActive) {
                // Kondisi OFF
                btn.classList.remove('active');
                if (cmdOff) sendOptronicCommand(cmdOff);
            } else {
                // Kondisi ON
                btn.classList.add('active');
                if (cmdOn) sendOptronicCommand(cmdOn);
            }
        });
    });
}

// ==========================================
// 5. KEYBOARD CONTROLS
// ==========================================
let currentSensorMode = 'VL'; // Track the mode for the 'M' toggle
let keyHoldIntervals = {};    // Track held keys to replicate the 150ms hold behavior

function startKeyAction(keyId, cmdStart) {
    if (keyHoldIntervals[keyId]) return; // Key is already being held
    
    // Send immediate command
    sendOptronicCommand(cmdStart);
    
    // Start the 150ms loop to match the UI button behavior
    keyHoldIntervals[keyId] = setInterval(() => {
        sendOptronicCommand(cmdStart);
    }, 150);
}

function stopKeyAction(keyId, cmdStop) {
    if (keyHoldIntervals[keyId]) {
        clearInterval(keyHoldIntervals[keyId]);
        delete keyHoldIntervals[keyId];
        
        // Send the single stop command
        sendOptronicCommand(cmdStop);
    }
}

function initKeyboardControls() {
    document.addEventListener('keydown', (e) => {
        // Only allow keyboard controls if the camera panel is open
        const cameraPanel = document.getElementById('right-camera-panel');
        if (!cameraPanel || cameraPanel.classList.contains('closed')) return;

        // Ignore if user is typing in a text box
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        // Prevent browser from repeatedly firing keydown if held down
        if (e.repeat) return; 

        switch(e.code) {
            case 'KeyW':
                startKeyAction('W', 'UP');
                break;
            case 'KeyS':
                startKeyAction('S', 'DOWN');
                break;
            case 'KeyA':
                startKeyAction('A', 'LEFT');
                break;
            case 'KeyD':
                startKeyAction('D', 'RIGHT');
                break;
            case 'KeyZ':
                startKeyAction('Z', 'VL_ZOOM_IN');
                break;
            case 'KeyX':
                startKeyAction('X', 'VL_ZOOM_OUT');
                break;
            case 'Space':
                e.preventDefault(); // Prevent page scrolling
                sendOptronicCommand('POINT_TRACK:0,0'); // Sent once on press
                break;
            case 'KeyC':
                sendOptronicCommand('CENTER');
                break;
            case 'KeyM':
                // Toggle between Daylight and Infrared
                currentSensorMode = (currentSensorMode === 'VL') ? 'IR' : 'VL';
                sendOptronicCommand(currentSensorMode);
                break;
            case 'KeyL':
                sendOptronicCommand('LASER_SINGLE');
                break;
            case 'KeyK':
                // Memicu klik pada UI agar tombol toggle LRF CONT ikut menyala hijau/mati
                const lrfContBtn = document.querySelector('[data-cmd-on="LASER_CONT"]');
                if (lrfContBtn) lrfContBtn.click();
                break;
                
            // --- MENU SELEKSI TARGET (UP, DOWN, Y, N) ---
            case 'ArrowDown':
                if (candidateList.length > 0) {
                    e.preventDefault(); // Cegah layar web ikut scroll
                    // Geser ke target berikutnya
                    selectedCandidateIndex = (selectedCandidateIndex + 1) % candidateList.length;
                    // paksa gambar ulang UI secara instan!
                    const updateUI = eval('renderCandidateUI'); 
                    if(updateUI) updateUI();
                }
                break;
                
            case 'ArrowUp':
                if (candidateList.length > 0) {
                    e.preventDefault();
                    // Geser ke target sebelumnya
                    selectedCandidateIndex = (selectedCandidateIndex - 1 + candidateList.length) % candidateList.length;
                    const updateUI = eval('renderCandidateUI'); 
                    if(updateUI) updateUI();
                }
                break;

            case 'KeyY':
                if (candidateList.length > 0) {
                    // Ambil target yang sedang dipilih, lalu kirim POINT_TRACK agar kamera menengahkan objek!
                    const target = candidateList[selectedCandidateIndex];
                    sendOptronicCommand(`POINT_TRACK:${target.gimbal_dx},${target.gimbal_dy}`);
                    
                    // Bersihkan UI langsung
                    candidateList = [];
                    const updateUI = eval('renderCandidateUI'); 
                    if(updateUI) updateUI();
                } else {
                    sendOptronicCommand('AI_LOCK');
                }
                break;
                
            case 'KeyN':
                if (candidateList.length > 0) {
                    // Tombol N berfungsi SAMA SEPERTI ArrowDown (Lompat/Abaikan target ini)
                    selectedCandidateIndex = (selectedCandidateIndex + 1) % candidateList.length;
                    const updateUI = eval('renderCandidateUI'); 
                    if(updateUI) updateUI();
                } else {
                    sendOptronicCommand('UNTRACK');
                }
                break;
        }
    });

    document.addEventListener('keyup', (e) => {
        const cameraPanel = document.getElementById('right-camera-panel');
        if (!cameraPanel || cameraPanel.classList.contains('closed')) return;
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        switch(e.code) {
            case 'KeyW':
                stopKeyAction('W', 'STOP');
                break;
            case 'KeyS':
                stopKeyAction('S', 'STOP');
                break;
            case 'KeyA':
                stopKeyAction('A', 'STOP');
                break;
            case 'KeyD':
                stopKeyAction('D', 'STOP');
                break;
            case 'KeyZ':
                stopKeyAction('Z', 'VL_ZOOM_STOP');
                break;
            case 'KeyX':
                stopKeyAction('X', 'VL_ZOOM_STOP');
                break;
            case 'KeyC':
                sendOptronicCommand('CENTER');
                break;
        }
        
    });
}