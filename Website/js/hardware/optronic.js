// js/ui/panels/hardware/optronic.js

import { setHardwareStatus } from '../../js/ui/panels/tabHardware.js';

let videoPlayer = null;
let controlWs = null;

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
                if (!document.fullscreenElement) {
                    // Masuk ke native fullscreen
                    if (cameraPanel.requestFullscreen) {
                        cameraPanel.requestFullscreen();
                    } else if (cameraPanel.webkitRequestFullscreen) { /* Safari */
                        cameraPanel.webkitRequestFullscreen();
                    } else if (cameraPanel.msRequestFullscreen) { /* IE11 */
                        cameraPanel.msRequestFullscreen();
                    }
                } else {
                    // Keluar dari native fullscreen
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
}

// ==========================================
// 2. VIDEO STREAM (Python MJPEG Bridge)
// ==========================================
function startVideoFeed() {
    const imgElement = document.getElementById('optronic-stream');
    if (!imgElement) return;

    const mjpegUrl = `http://127.0.0.1:8082/kamera`;

    if (!imgElement.src.includes(mjpegUrl)) {
        console.log("[OPTRONIC] Connecting to Python MJPEG Stream...");
        imgElement.src = `${mjpegUrl}?t=${new Date().getTime()}`;
    }

    // --- NEW: Video Click-to-Track Logic ---
    // Ensure we don't attach multiple event listeners if this function is called multiple times
    if (!imgElement.dataset.clickBound) {
        imgElement.addEventListener('click', (e) => {
            const rect = imgElement.getBoundingClientRect();
            
            // Calculate where the user clicked as a percentage (0.0 to 1.0)
            const xPct = (e.clientX - rect.left) / rect.width;
            const yPct = (e.clientY - rect.top) / rect.height;

            // INVERT the axes to match the gimbal's hardware coordinate system
            const dx = Math.round((xPct * 1920) - 960);
            const dy = -Math.round((yPct * 1080) - 540);
            sendOptronicCommand(`POINT_TRACK:${dx},${dy}`);
            console.log(`[OPTRONIC] Point Tracking sent -> Offset X: ${dx}, Y: ${dy}`);
        });
        imgElement.dataset.clickBound = "true";
    }
}

function stopVideoFeed() {
    const imgElement = document.getElementById('optronic-stream');
    if (imgElement) {
        // Clearing the source immediately terminates the HTTP stream connection
        imgElement.src = '';
        console.log("[OPTRONIC] Video stream stopped to save bandwidth.");
    }
}

// ==========================================
// 3. HARDWARE CONTROL WEBSOCKET
// ==========================================
function connectControlSocket() {
    if (controlWs && controlWs.readyState !== WebSocket.CLOSED) return;

    const controlUrl = `ws://127.0.0.1:9003/control`;
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
            // Ruang kosong ini siap digunakan kalau nanti kamu mau 
            // menambahkan fitur membaca telemetri dua arah dari Python
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
            case 'ShiftLeft':
                e.preventDefault(); // Prevent text highlighting
                startKeyAction('Shift', 'VL_ZOOM_IN');
                break;
            case 'ControlLeft':
                e.preventDefault(); // Prevent browser shortcuts
                startKeyAction('Ctrl', 'VL_ZOOM_OUT');
                break;
            case 'Space':
                e.preventDefault(); // Prevent page scrolling
                sendOptronicCommand('POINT_TRACK:0,0'); // Sent once on press
                break;
            case 'KeyM':
                // Toggle between Daylight and Infrared
                currentSensorMode = (currentSensorMode === 'VL') ? 'IR' : 'VL';
                sendOptronicCommand(currentSensorMode);
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
            case 'ShiftLeft':
                stopKeyAction('Shift', 'VL_ZOOM_STOP');
                break;
            case 'ControlLeft':
                stopKeyAction('Ctrl', 'VL_ZOOM_STOP');
                break;
        }
    });
}