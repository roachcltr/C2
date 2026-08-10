#pragma once
#include "02RadarTrack.h"
#include <map>
#include <vector>
#include <deque>

// ============================================================================
// STAGE 3 OF THE PIPELINE: turn a decoded plot into tactical data
// ============================================================================
// (formerly "ThreatEngine.h" / class ThreatEngine)
//
// Where 01_RadarPacketDecoder just decodes a single UDP payload with no
// memory of anything before it, ThreatAnalyzer is the stateful part of the
// system: it remembers each track's recent history (in track_history below)
// so it can answer the four "so what" questions for every incoming
// RadarTrack, in this order:
//   1. calculateCoordinates()     - where is it (lat/lon)?
//   2. evaluateKinematicProfile() - what is it (UAV / airliner / etc.)?
//   3. calculatePrediction()      - where is it going next?
//   4. calculateThreatScore()     - how dangerous is it, 0-100?
// ============================================================================

// A single snapshot in time
struct PlotSnapshot {
    double timestamp_sec;
    double cartesian_x;
    double cartesian_y;
    double heading_deg;
    double speed_ms;
};

// The sliding window for a single track
struct TrackState {
    std::deque<PlotSnapshot> history; // Our rolling buffer
    double smoothed_turn_rate_dps = 0.0;

    // Last ASTERIX raw_seconds at which this track was updated. Used by
    // pruneStaleTracks() to evict tracks that have gone quiet, so
    // track_history doesn't grow forever as track numbers rotate over a
    // long-running session.
    double last_seen_sec = 0.0;

    TrackState() = default; // Keeping our C++11 aggregate fix!
};

class ThreatAnalyzer {
public:
    ThreatAnalyzer(double anchorLat, double anchorLon);
    void processRecord(RadarTrack& record);

private:
    double truck_lat;
    double truck_lon;
    
    // Track History Memory: Maps Track ID to its previous state
    std::map<int, TrackState> track_history;

    // Last known-good kinematics per track, used by calculatePrediction() to
    // paper over a single noisy zero-speed sample instead of dropping the
    // prediction line. These used to be `static` locals inside
    // calculatePrediction() - moved here so they (a) get pruned alongside
    // track_history instead of leaking for the life of the process, and
    // (b) are ordinary member state instead of hidden function-static
    // globals, which matters if processRecord() is ever called from more
    // than one thread.
    std::map<int, double> last_good_speed_ms;
    std::map<int, double> last_good_heading_deg;

    // Counts calls to processRecord() so pruneStaleTracks() can run every
    // PRUNE_INTERVAL records instead of on every single one - sweeping all
    // tracks per-packet would be wasteful at high update rates.
    int records_since_prune = 0;
    static constexpr int PRUNE_INTERVAL = 200;

    // How long (in ASTERIX raw_seconds) a track can go unseen before we
    // consider it gone and evict it from all three maps above. Chosen to be
    // comfortably larger than the 20s staleness window already used inside
    // calculatePrediction() to clear a track's history buffer.
    static constexpr double TRACK_TIMEOUT_SEC = 90.0;

    // Function to convert polar radar data to Cartesian coordinates 
    void calculateCoordinates(RadarTrack& record);
    
    // Function to build the trajectory line
    void calculatePrediction(RadarTrack& record);

    // Function to evaluate the kinematic profile and update the smoothed turn rate
    void evaluateKinematicProfile(RadarTrack& record); 

    // Function to Calculate the Unified Threat Score
    void calculateThreatScore(RadarTrack& record);

    // Evicts tracks that haven't been updated in TRACK_TIMEOUT_SEC from
    // track_history, last_good_speed_ms, and last_good_heading_deg together,
    // so all three stay bounded by "currently active tracks" rather than
    // "every track number ever seen this process lifetime".
    void pruneStaleTracks(double current_time_sec);
};
