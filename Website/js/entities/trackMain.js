// js/entities/MainTrack.js
import { cesiumViewer } from '../core/Map.js';
import { spawnPredictionLine, updatePredictionLine } from './trackPrediction.js';
import { spawnHistoryLine, updateHistoryLine } from './trackTrail.js';
import { spawnVelocityArrow, updateVelocityArrow } from './trackVelocity.js';
import { startCleanupTimer } from './trackLifecycle.js';
import { getClassColor, getClassSymbol, formatAltitude } from './trackVisuals.js';
import { getPredictionPositions } from './trackGeometry.js';
import { feedPopupData } from './trackPopup.js';

// ===================== ENTITY BUILDERS =====================

export function spawnMainTrack(ctx) {
    const { id, airPosition, groundPosition, altMeters, classification, color, cesiumViewer, trackEntities, GLIDE_DURATION, getClassSymbol, formatAltitude } = ctx;

    const newEntity = cesiumViewer.entities.add({
        id: `track_${id}`,
        lastSeen: Date.now(),
        viewFrom: new Cesium.Cartesian3(0.0, -8000.0, 1500.0),
        
        position: new Cesium.CallbackProperty((time, result) => {
            const entity = trackEntities[id];
            if (!entity) return airPosition;
            let t = (Date.now() - entity.glideStartTime) / GLIDE_DURATION;
            if (t > 1.0) t = 1.0;
            return Cesium.Cartesian3.lerp(entity.startPos, entity.targetPos, t, result || new Cesium.Cartesian3());
        }, false),
        
        billboard: {
            image: getClassSymbol(classification, color.toCssColorString()),
            scale: 0.5,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2
        },
        
        polyline: {
            positions: new Cesium.CallbackProperty(() => {
                const entity = trackEntities[id];
                if (!entity) return [airPosition, groundPosition];
                let t = (Date.now() - entity.glideStartTime) / GLIDE_DURATION;
                if (t > 1.0) t = 1.0;
                const currentAir = Cesium.Cartesian3.lerp(entity.startPos, entity.targetPos, t, new Cesium.Cartesian3());
                const currentGround = Cesium.Cartesian3.lerp(entity.startGround, entity.targetGround, t, new Cesium.Cartesian3());
                return [currentAir, currentGround];
            }, false),
            width: 2,
            material: color,
            arcType: Cesium.ArcType.NONE
        },

        label: {
            text: `TRK-${id}\n${formatAltitude(altMeters)}m`,
            font: 'bold 14px JetBrains Mono, monospace',
            fillColor: Cesium.Color.WHITE,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 4,
            pixelOffset: new Cesium.Cartesian2(3, 0),
            horizontalOrigin: Cesium.HorizontalOrigin.LEFT
        }
    });
    
    newEntity.startPos = airPosition;
    newEntity.targetPos = airPosition;
    newEntity.startGround = groundPosition;
    newEntity.targetGround = groundPosition;
    newEntity.glideStartTime = Date.now();
    
    trackEntities[id] = newEntity;
}

export function updateMainTrack(ctx) {
    const { id, airPosition, groundPosition, altMeters, classification, color, trackEntities, getClassSymbol, formatAltitude } = ctx;
    const entity = trackEntities[id];
    
    if (!Cesium.Cartesian3.equals(entity.targetPos, airPosition)) {
        entity.startPos = entity.targetPos;
        entity.targetPos = airPosition;
        entity.startGround = entity.targetGround;
        entity.targetGround = groundPosition;
        entity.glideStartTime = Date.now();
    }
    
    entity.polyline.material = color;
    entity.billboard.image = getClassSymbol(classification, color.toCssColorString());
    entity.label.text = `TRK-${id}\n${formatAltitude(altMeters)}m`;
    entity.lastSeen = Date.now();
}

// ===================== ORCHESTRATION (formerly TrackerMarkers.js) =====================

const trackEntities = {};
const historyEntities = {};
const predictionEntities = {};
const MAX_HISTORY_POINTS = 40;
const GLIDE_DURATION = 1000;
const arrowEntities = {};

startCleanupTimer(trackEntities, predictionEntities, historyEntities, arrowEntities);

export function updateCesiumMarkers(activeTracks) {
    if (!cesiumViewer) return;

    for (const [id, track] of Object.entries(activeTracks)) {
        console.log("INCOMING TRACK DATA:", track);
        const geo = track.tactical_data?.geospatial;
        const altFt = track.raw_asterix?.altitude?.alt_ft || 0;
        const classification = track.tactical_data?.classification || "UNKNOWN";
        if (!geo) continue;

        const speedMs = track.raw_asterix?.velocity?.speed_mps || 0; 
        const headingDeg = track.raw_asterix?.velocity?.hdg_deg || 0;

        const cartographic = Cesium.Cartographic.fromDegrees(geo.lon, geo.lat);
        const terrainHeight = cesiumViewer.scene.globe.getHeight(cartographic) ?? 0;
        const altMeters = (altFt * 0.3048) + terrainHeight;

        const airPosition = Cesium.Cartesian3.fromDegrees(geo.lon, geo.lat, altMeters);
        const groundPosition = Cesium.Cartesian3.fromDegrees(geo.lon, geo.lat, terrainHeight);
        const color = getClassColor(classification);
        const predictions = track.tactical_data?.predictions || [];
        const predPositions = getPredictionPositions(airPosition, geo.lat, geo.lon, predictions, altMeters);

        // Package all necessary dependencies into a single context object
        const ctx = {
            id, airPosition, groundPosition, altMeters, classification, color, predPositions,
            speedMs, headingDeg, // <-- NEW: Pass kinematic data to context
            cesiumViewer, trackEntities, predictionEntities, historyEntities, arrowEntities, // <-- NEW: Pass dictionary
            GLIDE_DURATION, MAX_HISTORY_POINTS, getClassSymbol, formatAltitude
        };

        feedPopupData(id, track);
        
        if (!trackEntities[id]) {
            spawnMainTrack(ctx);
            spawnPredictionLine(ctx); 
            spawnHistoryLine(ctx); 
            spawnVelocityArrow(ctx); 
        } else {
            updateMainTrack(ctx);
            updatePredictionLine(ctx);
            updateHistoryLine(ctx);
            updateVelocityArrow(ctx);
        }
    }
}