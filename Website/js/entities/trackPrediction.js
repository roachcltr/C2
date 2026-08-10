export function spawnPredictionLine(ctx) {
    const { id, predPositions, color, cesiumViewer, predictionEntities } = ctx;
    if (predPositions.length === 0) return;

    const predEntity = cesiumViewer.entities.add({
        id: `pred_${id}`,
        polyline: {
            positions: new Cesium.CallbackProperty(() => {
                return predictionEntities[id].customPositions || [];
            }, false),
            width: 2,
            material: new Cesium.PolylineDashMaterialProperty({
                color: color.withAlpha(0.7),
                dashLength: 10.0
            }),
            arcType: Cesium.ArcType.NONE 
        }
    });
    
    predEntity.customPositions = predPositions;
    predictionEntities[id] = predEntity;
}

export function updatePredictionLine(ctx) {
    const { id, predPositions, color, predictionEntities } = ctx;

    if (predictionEntities[id] && predPositions.length > 0) {
        predictionEntities[id].customPositions = predPositions;
        predictionEntities[id].polyline.material.color = color.withAlpha(0.7);
    } else if (!predictionEntities[id] && predPositions.length > 0) {
        spawnPredictionLine(ctx); 
    }
}