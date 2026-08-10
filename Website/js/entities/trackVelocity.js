// js/entities/trackVelocity.js

export function spawnVelocityArrow(ctx) {
    const { id, color, cesiumViewer, arrowEntities } = ctx;

    const arrowEntity = cesiumViewer.entities.add({
        id: `arrow_${id}`,
        polyline: {
            positions: new Cesium.CallbackProperty(() => {
                const data = arrowEntities[id];
                if (!data || !data.currentPos || data.speedMs === undefined) return [];

                // 1 m/s of speed = 3 meters of visual arrow length
                const scaleFactor = 3.0; 
                
                // Convert heading to radians
                const headingRad = Cesium.Math.toRadians(data.headingDeg);

                // Calculate X (East) and Y (North) velocity in local space
                const vx = Math.sin(headingRad) * data.speedMs * scaleFactor;
                const vy = Math.cos(headingRad) * data.speedMs * scaleFactor;
                
                // Create a local coordinate offset
                const localOffset = new Cesium.Cartesian3(vx, vy, 0);

                // Create a transform matrix anchored at the drone's current 3D position
                const transformMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(data.currentPos);

                // Apply the offset to the matrix to get the tip of the arrow in ECEF globe coordinates
                const tipPosition = Cesium.Matrix4.multiplyByPoint(
                    transformMatrix, 
                    localOffset, 
                    new Cesium.Cartesian3()
                );

                return [data.currentPos, tipPosition];
            }, false),
            
            width: 12, // Needs to be thick for the arrowhead to render properly
            material: new Cesium.PolylineArrowMaterialProperty(color.withAlpha(0.9)),
            arcType: Cesium.ArcType.NONE 
        }
    });
    
    arrowEntities[id] = arrowEntity;
}

export function updateVelocityArrow(ctx) {
    const { id, airPosition, speedMs, headingDeg, color, arrowEntities } = ctx;

    if (arrowEntities[id]) {
        // Feed the newest data to the CallbackProperty
        arrowEntities[id].currentPos = airPosition;
        arrowEntities[id].speedMs = speedMs;
        arrowEntities[id].headingDeg = headingDeg;
        arrowEntities[id].polyline.material.color = color.withAlpha(0.9);
    } else {
        spawnVelocityArrow(ctx);
        arrowEntities[id].currentPos = airPosition;
        arrowEntities[id].speedMs = speedMs;
        arrowEntities[id].headingDeg = headingDeg;
    }
}