// js/ui/buttons/resetView.js
import { cesiumViewer } from '../../core/Map.js'; 

export function initResetView() {
    const resetBtn = document.getElementById('reset-view-btn');
    
    const resetCamera = () => {
        if (cesiumViewer) {
            // Get the camera's current position in radians
            const currentPosition = cesiumViewer.camera.positionCartographic;
            
            // Convert to degrees
            const currentLon = Cesium.Math.toDegrees(currentPosition.longitude);
            const currentLat = Cesium.Math.toDegrees(currentPosition.latitude);

            // Fly to the same location, but reset the height, pitch, and heading
            cesiumViewer.camera.flyTo({
                destination: Cesium.Cartesian3.fromRadians(
                    currentPosition.longitude, 
                    currentPosition.latitude, 
                    150000.0 
                ),
                orientation: {
                    heading: Cesium.Math.toRadians(0.0),
                    pitch: Cesium.Math.toRadians(-90.0),
                    roll: 0.0
                },
                duration: 1.0
            });
        } else {
            console.error('[MAP] Error');
        }
    };

    // Eksekusi via tombol UI
    if (resetBtn) {
        resetBtn.addEventListener('click', resetCamera);
    }

    // Eksekusi via tombol Space di keyboard
    window.addEventListener('keydown', (e) => {
        // Abaikan jika user sedang mengetik di dalam form/input
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        
        if (e.code === 'Space') {
            e.preventDefault(); 
            resetCamera();
        }
    });
}