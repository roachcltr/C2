// (formerly "ThreatEngine.cpp" - see 03_ThreatAnalyzer.h for what this
// file's job is in the overall pipeline)

#include "03ThreatAnalyzer.h"
#include <cmath>
#include <iostream>

ThreatAnalyzer::ThreatAnalyzer(double anchorLat, double anchorLon) {
    truck_lat = anchorLat;
    truck_lon = anchorLon;
}

void ThreatAnalyzer::processRecord(RadarTrack& record) {
    if (!record.valid) return;
    
    // 1. Where is it?
    calculateCoordinates(record);
    
    // 2. What is it?
    evaluateKinematicProfile(record); 
    
    // 3. Where is it going?
    calculatePrediction(record); 

    // 4. How dangerous is it?
    calculateThreatScore(record);

    // 5. Housekeeping: periodically sweep out tracks we haven't heard from
    // in a while, so track_history / last_good_speed_ms / last_good_heading_deg
    // don't grow for the lifetime of the process as track numbers rotate.
    // Runs every PRUNE_INTERVAL records rather than every record, since a
    // full map sweep on every single packet would be wasted work at typical
    // radar update rates.
    if (++records_since_prune >= PRUNE_INTERVAL) {
        records_since_prune = 0;
        pruneStaleTracks(record.raw_seconds);
    }
}

// Removes any track from track_history / last_good_speed_ms /
// last_good_heading_deg that hasn't been updated in TRACK_TIMEOUT_SEC,
// judged against the most recently processed record's timestamp. Without
// this, these three containers accumulate one entry per distinct
// track_number ever observed and never shrink - a slow leak over a
// long-running session as the radar assigns and drops track IDs.
void ThreatAnalyzer::pruneStaleTracks(double current_time_sec) {
    for (auto it = track_history.begin(); it != track_history.end(); ) {
        double dt = current_time_sec - it->second.last_seen_sec;
        // ASTERIX time-of-day wraps at 24h (86400s); a large negative dt
        // means the clock rolled over, not that the track is ancient, so
        // don't evict on a raw negative reading the way calculatePrediction
        // corrects total_dt - just skip eviction that round and let the
        // next real gap resolve it.
        if (dt >= TRACK_TIMEOUT_SEC) {
            int stale_id = it->first;
            it = track_history.erase(it);
            last_good_speed_ms.erase(stale_id);
            last_good_heading_deg.erase(stale_id);
        } else {
            ++it;
        }
    }
}

// 1. This function converts polar radar data to Cartesian coordinates and then to absolute latitude/longitude based on the truck's anchor position.
void ThreatAnalyzer::calculateCoordinates(RadarTrack& record) {
    if (record.range_meters <= 0.0) return;

    // A. Polar to Cartesian (Truck is 0,0)
    double az_rad = record.azimuth_deg * (M_PI / 180.0);
    record.cartesian_x = record.range_meters * std::sin(az_rad);
    record.cartesian_y = record.range_meters * std::cos(az_rad);

    // B. Cartesian to Absolute Lat/Lon
    const double EARTH_RADIUS = 6378137.0; 
    double lat_offset = record.cartesian_y / EARTH_RADIUS;
    double lon_offset = record.cartesian_x / (EARTH_RADIUS * std::cos(truck_lat * M_PI / 180.0));

    record.latitude = truck_lat + (lat_offset * 180.0 / M_PI);
    record.longitude = truck_lon + (lon_offset * 180.0 / M_PI);
}

// 2. This function builds a future trajectory line based on current speed, heading, and whether the target is maneuvering (using the ASTERIX maneuver bit).
void ThreatAnalyzer::calculatePrediction(RadarTrack& record) {
    if (record.track_number == -1) return;

    // MIL-GRADE FIX 4: DON'T DROP THE LINE ON A NOISY ZERO-SPEED SAMPLE
    // A single CAT-048 hit reporting speed_ms <= 0.0 (common radar jitter/dropout)
    // used to bail out of this function entirely, so that frame's JSON omitted
    // "predictions" altogether and the UI's prediction line would disappear and
    // reappear every time this happened - a constant flicker with no actual bug
    // in the frontend. Instead, fall back to the last known good speed/heading
    // for this track so we keep emitting a (slightly stale) prediction line
    // rather than nothing.
    //
    // last_good_speed_ms / last_good_heading_deg used to be `static` locals
    // right here, which meant (a) they lived for the whole process and were
    // never cleaned up even after a track disappeared for good, and (b) they
    // were invisible shared state that would race if processRecord() were
    // ever called from more than one thread. They're now ThreatAnalyzer
    // members instead - see pruneStaleTracks() for how they get cleaned up.
    double effective_speed = record.speed_ms;
    double effective_heading = record.heading_deg;

    if (effective_speed <= 0.0) {
        auto speedIt = last_good_speed_ms.find(record.track_number);
        if (speedIt == last_good_speed_ms.end()) {
            // No prior good sample for this track yet - nothing sensible to predict from.
            return;
        }
        effective_speed = speedIt->second;
        auto hdgIt = last_good_heading_deg.find(record.track_number);
        if (hdgIt != last_good_heading_deg.end()) {
            effective_heading = hdgIt->second;
        }
    } else {
        last_good_speed_ms[record.track_number] = effective_speed;
        last_good_heading_deg[record.track_number] = effective_heading;
    }

    TrackState& state = track_history[record.track_number];

    // Mark this track as freshly seen so pruneStaleTracks() knows not to
    // evict it yet. Updated on every touch, independent of the
    // effective_speed fallback logic above.
    state.last_seen_sec = record.raw_seconds;

    // 1. PUSH NEWEST SNAPSHOT
    state.history.push_back({
        record.raw_seconds, record.cartesian_x, record.cartesian_y, 
        effective_heading, effective_speed
    });

    const size_t MAX_WINDOW_SIZE = 4;
    while (state.history.size() > MAX_WINDOW_SIZE) {
        state.history.pop_front(); 
    }

    double current_acceleration = 0.0; // meters per second squared

    // 2. ADVANCED WINDOW MATH & STALE DATA PURGE
    if (state.history.size() >= 3) {
        const PlotSnapshot& oldest = state.history.front();
        const PlotSnapshot& newest = state.history.back();

        double total_dt = newest.timestamp_sec - oldest.timestamp_sec;
        if (total_dt < 0) total_dt += 86400.0;

        // MIL-GRADE FIX 1: STALE DATA PURGE
        // If the gap between plots is larger than 20 seconds, the radar lost it.
        // Dump the history so we don't calculate corrupted physics.
        if (total_dt > 20.0) {
            state.history.clear();
            state.smoothed_turn_rate_dps = 0.0;
        } 
        else if (total_dt > 0.0) {
            // Calculate Turn Rate
            double total_heading_change = newest.heading_deg - oldest.heading_deg;
            while (total_heading_change > 180.0)  total_heading_change -= 360.0;
            while (total_heading_change < -180.0) total_heading_change += 360.0;
            state.smoothed_turn_rate_dps = total_heading_change / total_dt;

            // MIL-GRADE FIX 2: LINEAR ACCELERATION
            current_acceleration = (newest.speed_ms - oldest.speed_ms) / total_dt;
        }
    }

    bool is_maneuvering = (record.track_status != -1) && (record.track_status & 0x10);

    // Predict up to 5 minutes (300 seconds) in 5-second chunks
    std::vector<double> forecast_intervals;
    for (double t = 2.0; t <= 60.0; t += 2.0) forecast_intervals.push_back(t);

    // MIL-GRADE FIX 3: ITERATIVE STEP PREDICTION
    // Instead of a single calculus formula from origin, we step forward in time
    double sim_x = 0.0; // Using relative offsets for your UI
    double sim_y = 0.0;
    double sim_hdg_rad = effective_heading * (M_PI / 180.0);
    double sim_speed = effective_speed;
    double last_time = 0.0;
    double total_predicted_turn_deg = 0.0;

    for (double future_t : forecast_intervals) {
        double step_dt = future_t - last_time;

        double decay_factor = std::max(0.0, 1.0 - (future_t / 15.0)); 
        sim_speed += (current_acceleration * decay_factor * step_dt);
        if (sim_speed < 100.0) sim_speed = 100.0;

        // Turn Rate Decay: Assume they level out after 30 seconds of maneuvering
        double active_omega = 0.0;
        
        // --- SENSITIVITY TWEAKS ---
        // 1. Scalar: Reduce the raw mathematical turn rate by 50% to widen the predicted curves
        const double TURN_SENSITIVITY = 0.50; 
        
        // If they are evading AND the prediction hasn't already curled 90 degrees...
        if (is_maneuvering && std::abs(total_predicted_turn_deg) < 90.0) {
            // Apply the sensitivity scalar
            active_omega = (state.smoothed_turn_rate_dps * TURN_SENSITIVITY) * (M_PI / 180.0);
            double turn_decay = std::max(0.0, 1.0 - (future_t / 30.0));
            active_omega *= turn_decay;
        }

        // Apply Turn
        double turn_step_rad = active_omega * step_dt;
        sim_hdg_rad += turn_step_rad;
        
        // Log how far the prediction has turned so far
        total_predicted_turn_deg += (turn_step_rad * (180.0 / M_PI));

        // Calculate Distance for this specific step
        double step_distance = sim_speed * step_dt;

        // Add to running relative totals
        sim_x += step_distance * std::sin(sim_hdg_rad);
        sim_y += step_distance * std::cos(sim_hdg_rad);

        record.prediction_line.push_back({sim_x, sim_y});
        
        last_time = future_t; // advance the clock
    }
}

// 3. This function evaluates the target's kinematics to guess its platform type
void ThreatAnalyzer::evaluateKinematicProfile(RadarTrack& record) {
    // We need both speed and altitude to make an accurate guess
    if (record.speed_ms <= 0.0 && record.altitude_ft <= 0.0) {
        record.classification = "UNKNOWN_NO_DATA";
        return;
    }

    double speed = record.speed_ms;
    double alt = record.altitude_ft;

    // PROFILE 1: UAV / Drone / Light Rotary
    // Speeds under ~100 knots (50 m/s), low altitude
    if (speed < 50.0 && alt < 5000.0) {
        record.classification = "UAV";
    }
    // PROFILE 2: Commercial Airliner / Heavy Transport
    // Speeds between ~300-500 knots (150-260 m/s), high cruising altitude
    else if (speed >= 150.0 && speed < 300.0 && alt > 15000.0) {
        record.classification = "FIXED_WING_HEAVY";
    }
    // PROFILE 3: Tactical Fighter / High-Speed Missile
    // Speeds exceeding ~600 knots (300+ m/s)
    else if (speed >= 300.0) {
        record.classification = "HIGH_SPEED_TACTICAL";
    }
    // PROFILE 4: General Aviation / Uncategorized
    else {
        record.classification = "BOGEY";
    }

    // OVERRIDE: If the maneuver bit is active, append a warning flag
    if ((record.track_status != -1) && (record.track_status & 0x10)) {
        record.classification += " (EVASIVE)";
    }
}

// 4. This function fuses multiple data points into a single 0-100 threat matrix
void ThreatAnalyzer::calculateThreatScore(RadarTrack& record) {
    int score = 0;

    // RULE 1: Base Profile (What is it?)
    if (record.classification.find("HIGH_SPEED_TACTICAL") != std::string::npos) {
        score += 50; // Jets/Missiles are inherently dangerous
    } 
    else if (record.classification.find("UAV") != std::string::npos) {
        score += 25; // Drones are a moderate security risk
    } 
    else if (record.classification.find("FIXED_WING_HEAVY") != std::string::npos) {
        score += 5;  // Airliners are generally safe
    } 
    else {
        score += 15; // Unknown bogeys get a slight penalty
    }

    // RULE 2: Behavioral Assessment (What is it doing?)
    if ((record.track_status != -1) && (record.track_status & 0x10)) {
        score += 30; // Active evasive maneuvers are highly suspicious
    }

    // RULE 3: Spatial Proximity (Where is it?)
    // If it gets within 15km of the radar truck, escalate the score
    if (record.range_meters < 15000.0) {
        score += 20; 
    } else if (record.range_meters < 30000.0) {
        score += 10;
    }

    // Cap the score at a maximum of 100
    if (score > 100) {
        score = 100;
    }

    record.threat_score = score;
}
