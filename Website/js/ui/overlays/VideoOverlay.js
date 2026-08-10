// js/VideoOverlay.js
import { cesiumViewer, SITE_LAT, SITE_LON } from '../../core/Map.js';

let isVideoEnabled = false;
let canvas, ctx;
let renderAnimFrame = null;

// The Queue: WebSockets push here, the Render Loop pulls from here.
let sweepBuffer = []; 

export function initVideoOverlay() {
    canvas = document.getElementById('radar-video-canvas');
    ctx = canvas.getContext('2d', { alpha: true }); // optimize canvas context
    
    const toggle = document.getElementById('cat240-toggle');
    toggle.addEventListener('change', (e) => {
        isVideoEnabled = e.target.checked;
        if (isVideoEnabled) {
            cesiumViewer.camera.flyTo({
                destination: Cesium.Cartesian3.fromDegrees(SITE_LON, SITE_LAT, 90000.0),
                orientation: {
                    heading: Cesium.Math.toRadians(0.0),
                    pitch: Cesium.Math.toRadians(-90.0),
                    roll: 0.0
                },
                duration: 0
            });
            resizeCanvas();
            sweepBuffer = []; // Clear old junk
            renderLoop();
        } else {
            cancelAnimationFrame(renderAnimFrame);
            ctx.clearRect(0, 0, canvas.width, canvas.height); 
        }
    });

    window.addEventListener('resize', resizeCanvas);
}

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

// Extremely lightweight: Just catch the data and hold it.
export function handleIncomingSweep(azimuthDeg, amplitudes) {
    if (!isVideoEnabled) return;
    
    sweepBuffer.push({ azimuthDeg, amplitudes });

    // Safety valve: If the browser tab is minimized, requestAnimationFrame pauses, 
    // but WebSockets keep firing. This prevents memory leaks.
    if (sweepBuffer.length > 720) {
        sweepBuffer = sweepBuffer.slice(-360);
    }
}

// Runs exactly at monitor refresh rate (e.g., 60 FPS)
function renderLoop() {
    if (!isVideoEnabled || !cesiumViewer) return;

    // Camera Reset: Ensure the camera is always looking straight down at the radar site
    cesiumViewer.camera.flyTo({
        orientation: {
            heading: Cesium.Math.toRadians(0.0),
            pitch: Cesium.Math.toRadians(-90.0),
            roll: 0.0
        },
        duration: 0
    });
    
    // 1. Fade out the old sweeps (Phosphor trail effect)
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "rgba(0, 0, 0, 0.04)"; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = "source-over";

    // 2. ONLY draw if we have new sweeps waiting in the buffer
    if (sweepBuffer.length > 0) {
        
        // CACHE THE MATH: Calculate the center and radius just ONCE per frame
        const centerCartesian = Cesium.Cartesian3.fromDegrees(SITE_LON, SITE_LAT, 0);
        const centerPt = Cesium.SceneTransforms.wgs84ToWindowCoordinates(cesiumViewer.scene, centerCartesian);
        
        if (centerPt) {
            const earthRadius = 6378137.0;
            const maxRangeMeters = 10 * 1852; 
            const lonOffset = maxRangeMeters / (earthRadius * Math.cos(SITE_LAT * Math.PI / 180));
            const edgeCartesian = Cesium.Cartesian3.fromDegrees(SITE_LON + (lonOffset * 180 / Math.PI), SITE_LAT, 0);
            const edgePt = Cesium.SceneTransforms.wgs84ToWindowCoordinates(cesiumViewer.scene, edgeCartesian);
            
            if (edgePt) {
                const maxRadiusPx = Math.abs(edgePt.x - centerPt.x);
                const cellWidthPx = maxRadiusPx / 256;
                const blockSize = Math.max(2, cellWidthPx * 1.5);

                // 3. BATCH DRAW: Empty the buffer onto the canvas
                for (let s = 0; s < sweepBuffer.length; s++) {
                    const sweep = sweepBuffer[s];
                    const azRad = (sweep.azimuthDeg - 90) * (Math.PI / 180);
                    const cosAz = Math.cos(azRad);
                    const sinAz = Math.sin(azRad);

                    for (let i = 0; i < sweep.amplitudes.length; i++) {
                        const amplitude = sweep.amplitudes[i];
                        if (amplitude <= 30) continue; 
                        
                        const distPx = i * cellWidthPx;
                        const x = centerPt.x + distPx * cosAz;
                        const y = centerPt.y + distPx * sinAz;

                        // Color mapping based on signal strength
                            if (amplitude >= 240) {
                                ctx.fillStyle = "rgba(255, 0, 0, 1.0)";  // Red (Strong)
                                const blockSize = Math.max(2, cellWidthPx * 4);
                                ctx.fillRect(x - blockSize/2, y - blockSize/2, blockSize, blockSize);
                            } else if (amplitude > 150) {
                                ctx.fillStyle = "rgba(234, 179, 8, 0.85)"; // Yellow (Medium)
                                const blockSize = Math.max(2, cellWidthPx * 2);
                                ctx.fillRect(x - blockSize/2, y - blockSize/2, blockSize, blockSize);
                            } else {
                                ctx.fillStyle = "rgba(10, 220, 50, 0.7)";  // Green (Weak)
                                const blockSize = Math.max(2, cellWidthPx * 2);
                                ctx.fillRect(x - blockSize/2, y - blockSize/2, blockSize, blockSize);
                            }
                        
                        
                    }
                }
            }
        }
        
        // Empty the buffer now that we've drawn everything
        sweepBuffer = []; 
    }

    renderAnimFrame = requestAnimationFrame(renderLoop);
}