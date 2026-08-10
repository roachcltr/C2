// js/ui/buttons/baseView.js
import { cesiumViewer, SITE_LAT, SITE_LON } from '../../core/Map.js';

export function initBaseView() {
    const baseBtn = document.getElementById('base-btn');
    if (!baseBtn) return;

    const baseIcon = `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-map-pin-house-icon lucide-map-pin-house"><path d="M15 22a1 1 0 0 1-1-1v-4a1 1 0 0 1 .445-.832l3-2a1 1 0 0 1 1.11 0l3 2A1 1 0 0 1 22 17v4a1 1 0 0 1-1 1z"/><path d="M18 10a8 8 0 0 0-16 0c0 4.993 5.539 10.193 7.399 11.799a1 1 0 0 0 .601.2"/><path d="M18 22v-3"/><circle cx="10" cy="10" r="3"/></svg>`;
    const notbaseIcon = `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-map-pin-off-icon lucide-map-pin-off"><path d="M12.75 7.09a3 3 0 0 1 2.16 2.16"/><path d="M17.072 17.072c-1.634 2.17-3.527 3.912-4.471 4.727a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 1.432-4.568"/><path d="m2 2 20 20"/><path d="M8.475 2.818A8 8 0 0 1 20 10c0 1.183-.31 2.377-.81 3.533"/><path d="M9.13 9.13a3 3 0 0 0 3.74 3.74"/></svg>`;

    let isBaseLocked = false;
    baseBtn.innerHTML = baseIcon;

    // Create an event handler to intercept mouse wheel actions
    const customZoomHandler = new Cesium.ScreenSpaceEventHandler(cesiumViewer.scene.canvas);

    baseBtn.addEventListener('click', () => {
        isBaseLocked = !isBaseLocked;
        const cameraController = cesiumViewer.scene.screenSpaceCameraController;

        if (isBaseLocked) {
            baseBtn.innerHTML = notbaseIcon;
            cesiumViewer.trackedEntity = undefined;

            cesiumViewer.camera.flyTo({
                destination: Cesium.Cartesian3.fromDegrees(SITE_LON, SITE_LAT, 150000.0),
                orientation: {
                    heading: Cesium.Math.toRadians(0.0),
                    pitch: Cesium.Math.toRadians(-90.0),
                    roll: 0.0
                },
                duration: 1.0
            });

            // 1. Lock all native camera inputs (INCLUDING ZOOM)
            cameraController.enableRotate = false;
            cameraController.enableTranslate = false;
            cameraController.enableZoom = false;
            cameraController.enableTilt = false;
            cameraController.enableLook = false;

            // 2. Inject our custom "Straight Up/Down" Zoom Logic
            customZoomHandler.setInputAction((wheelDelta) => {
                // Get current camera altitude to scale the zoom speed (fast up high, slow down low)
                const currentHeight = cesiumViewer.camera.positionCartographic.height;
                const zoomAmount = currentHeight * 0.15;

                if (wheelDelta > 0) {
                    cesiumViewer.camera.zoomIn(zoomAmount); // Move straight forward
                } else if (wheelDelta < 0) {
                    cesiumViewer.camera.zoomOut(zoomAmount); // Move straight backward
                }
            }, Cesium.ScreenSpaceEventType.WHEEL);
            
            // ==========================================
            // AUTO-UNLOCK ON TARGET ACQUISITION
            // ==========================================
            cesiumViewer.trackedEntityChanged.addEventListener((entity) => {
                // If the user just locked onto an entity (entity is not undefined)
                // AND Base View is currently active...
                if (entity && isBaseLocked) {
                    console.log("[System] Target locked. Disabling Base View to restore camera controls.");
                    baseBtn.click(); 
                }
            });
        } else {
            baseBtn.innerHTML = baseIcon;

            // 1. Restore all native camera inputs
            cameraController.enableRotate = true;
            cameraController.enableTranslate = true;
            cameraController.enableZoom = true;
            cameraController.enableTilt = true;
            cameraController.enableLook = true;

            // 2. Remove our custom wheel interceptor so normal zooming returns
            customZoomHandler.removeInputAction(Cesium.ScreenSpaceEventType.WHEEL);
        }
    });
}