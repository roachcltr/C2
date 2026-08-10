// js/ui/buttons/compass.js
import { cesiumViewer } from '../../core/Map.js';

export function initCompass() {
    const compassWidget = document.getElementById('compass-widget');
    const compassArrow = document.getElementById('compass-arrow');

    if (!compassWidget || !compassArrow || !cesiumViewer) return;

    // 1. Sync the arrow rotation to the camera heading every frame
    cesiumViewer.scene.preRender.addEventListener(() => {
        const headingRads = cesiumViewer.camera.heading;
        const headingDeg = headingRads * (180 / Math.PI);

        // To point North on the screen, rotate the opposite of the camera's heading
        compassArrow.style.transform = `rotate(${headingDeg}deg)`;
    });

    // 2. Click to instantly reset camera to North
    compassWidget.addEventListener('click', () => {
        const currentPitch = cesiumViewer.camera.pitch;

        // ==========================================================
        // CASE 1: Currently locked onto a target
        // ==========================================================
        if (cesiumViewer.trackedEntity) {
            const target = cesiumViewer.trackedEntity;
            const targetPos = target.position 
                ? target.position.getValue(cesiumViewer.clock.currentTime) 
                : null;

            if (targetPos) {
                // Calculate distance so we preserve the exact zoom level
                const currentRange = Cesium.Cartesian3.distance(cesiumViewer.camera.positionWC, targetPos);
                // 1. Temporarily break the lock for a smooth rotation flight
                cesiumViewer.trackedEntity = undefined;
                // 2. Fly around the target until heading is True North (0.0)
                cesiumViewer.flyTo(target, {
                    offset: new Cesium.HeadingPitchRange(0.0, currentPitch, currentRange),
                    duration: 0.5
                }).then(() => {
                    // 3. The Promise resolves when flight ends -> Instantly re-engage the lock!
                    cesiumViewer.trackedEntity = target;
                });
                return; // Stop execution here so we don't trigger the free-cam logic below
            }
        }

        // ==========================================================
        // CASE 2: Free Camera Mode (No target lock)
        // ==========================================================
        const currentPositionWC = Cesium.Cartesian3.clone(cesiumViewer.camera.positionWC);
        
        cesiumViewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);

        cesiumViewer.camera.flyTo({
            destination: currentPositionWC,
            orientation: {
                heading: 0.0, // North
                pitch: currentPitch,
                roll: 0.0
            },
            duration: 0.5
        });
    });
}