#pragma once
#include <string>
#include <sstream>
#include <iomanip>
#include <vector>  
#include <utility> 

// ============================================================================
// STAGE 2 OF THE PIPELINE: the shared "shape" of one radar detection
// ============================================================================
// (formerly "AsterixRecord.h" / struct AsterixRecord)
//
// One RadarTrack = one decoded plot for one target at one point in time.
// 01_RadarPacketDecoder.cpp fills in the top section (raw decoded fields,
// named after their ASTERIX field number/FRN). 03_ThreatAnalyzer.cpp then
// fills in the bottom section (computed tactical fields: position,
// prediction, classification, threat score). Finally toJson() below
// serializes the whole thing for 04_ServerMain.cpp to broadcast to the UI.
// ============================================================================
struct RadarTrack {
    bool valid = false;
    std::string error_msg = "";
    
    // Header
    int category = 0;
    int length = 0;
    
    // FRN 1
    int sac = -1;
    int sic = -1;
    
    // FRN 2
    double raw_seconds = 0.0;
    std::string formatted_time = "";
    bool has_time = false; // raw_seconds == 0.0 is a valid timestamp (midnight); can't use it as "field absent"
    
    // FRN 3
    int target_descriptor = -1;
    
    // FRN 4 (Polar Kinematics)
    double range_nm = 0.0;
    double range_meters = 0.0;
    double azimuth_deg = 0.0;
    bool has_position = false; // azimuth 0.0 / range 0.0 (directly at anchor) are both legitimate

    // Engine Calc (Derived from FRN 4)
    double cartesian_x = 0.0; 
    double cartesian_y = 0.0; 
    double latitude = 0.0;
    double longitude = 0.0;
    bool has_geospatial = false; // a target directly on the x or y axis legitimately has x_m/y_m == 0.0
    
    // FRN 6 / FRN 19
    double flight_level = 0.0;
    double altitude_ft = 0.0;
    bool has_altitude = false; // altitude_ft is a signed value; 0.0 (and negative) are legitimate readings
    
    // FRN 7
    int snr = -1; 

    // FRN 11
    int track_number = -1;

    // FRN 13
    double speed_ms = 0.0;
    double heading_deg = 0.0;
    bool has_velocity = false; // a genuinely stationary target legitimately reports speed_ms == 0.0
    
    // FRN 14
    int track_status = -1;
    
    // FRN 20
    double doppler_speed_ms = 0.0;
    bool has_doppler = false; // a target with zero radial velocity legitimately reports doppler == 0.0

    // Engine Calc (Threat Engine Outputs)
    std::string classification = "UNKNOWN";
    std::vector<std::pair<double, double>> prediction_line;
    int threat_score = 0;

    // Clean JSON Generation with Domain Separation
    std::string toJson() const {
        if (!valid) return "{ \"error\": \"" + error_msg + "\" }";
        
        std::ostringstream out;
        out << std::fixed << std::setprecision(2);
        
        // 1. Build RAW ASTERIX Block (Strict FRN Order)
        std::vector<std::string> asterix_blocks;
        
        // Header
        asterix_blocks.push_back("\"metadata\": { \"cat\": " + std::to_string(category) + ", \"len\": " + std::to_string(length) + " }");
        
        // FRN 1: Source
        if (sac != -1) asterix_blocks.push_back("\"source\": { \"sac\": " + std::to_string(sac) + ", \"sic\": " + std::to_string(sic) + " }");
        
        // FRN 2: Time of Day
        // Was: `if (raw_seconds != 0.0)` - a target reported at exactly
        // midnight (raw_seconds == 0.0) is a legitimate timestamp, not a
        // missing field, so that check would silently drop the whole
        // timestamp block for any plot in the first ~1/128s of the day.
        // Also switched std::to_string(raw_seconds) -> a stream with
        // setprecision(2), since std::to_string on a double always emits
        // 6 decimal digits regardless of the precision set on `out` above -
        // every other double in this function was drifting to 6-decimal
        // output through std::to_string while the manually-streamed blocks
        // (vel/geo/pred/dop) stayed at their intended precision.
        if (has_time) {
            std::ostringstream ts;
            ts << std::fixed << std::setprecision(2)
               << "\"timestamp\": { \"raw_seconds\": " << raw_seconds
               << ", \"formatted_time\": \"" << formatted_time << "\" }";
            asterix_blocks.push_back(ts.str());
        }
        
        // FRN 3: Descriptor
        if (target_descriptor != -1) asterix_blocks.push_back("\"descriptor\": " + std::to_string(target_descriptor));
        
        // FRN 4: Position
        // Was: `if (range_nm != 0.0)` - a target reported at exactly the
        // anchor's range (unlikely but not impossible, e.g. sensor fusion
        // artifacts) would silently vanish from the position block.
        if (has_position) {
            std::ostringstream pos;
            pos << std::fixed << std::setprecision(2)
                << "\"position\": { \"range_nm\": " << range_nm
                << ", \"range_m\": " << range_meters
                << ", \"az_deg\": " << azimuth_deg << " }";
            asterix_blocks.push_back(pos.str());
        }
        
        // FRN 7: SNR
        if (snr != -1) asterix_blocks.push_back("\"radar\": { \"snr\": " + std::to_string(snr) + " }");
        
        // FRN 13: Velocity
        // Was: `if (speed_ms != 0.0)` - a genuinely stationary target
        // (speed_ms == 0.0) would lose its entire velocity block, which is
        // exactly the case you'd most want a "confirmed stationary" reading
        // to survive into the JSON rather than disappear.
        if (has_velocity) {
            std::ostringstream vel; 
            vel << std::fixed << std::setprecision(2) << "\"velocity\": { \"speed_mps\": " << speed_ms << ", \"hdg_deg\": " << heading_deg << " }";
            asterix_blocks.push_back(vel.str());
        }
        
        // FRN 14: Status
        if (track_status != -1) asterix_blocks.push_back("\"status\": " + std::to_string(track_status));

        // FRN 19: Altitude
        // Was: `if (altitude_ft != 0.0 || flight_level != 0.0)` - altitude_ft
        // is parsed from a *signed* int16 (01_RadarPacketDecoder.cpp FRN 19),
        // so negative and exactly-zero readings are both legitimate; either
        // one used to drop the whole altitude block.
        if (has_altitude) {
            std::ostringstream alt;
            alt << std::fixed << std::setprecision(2)
                << "\"altitude\": { \"fl\": " << flight_level << ", \"alt_ft\": " << altitude_ft << " }";
            asterix_blocks.push_back(alt.str());
        }
        
        // FRN 20: Doppler
        // Was: `if (doppler_speed_ms != 0.0)` - a target with zero radial
        // (line-of-sight) velocity, e.g. moving tangentially to the radar,
        // legitimately reports doppler == 0.0 and would vanish from output.
        if (has_doppler) {
            std::ostringstream dop; 
            dop << std::fixed << std::setprecision(2) << "\"doppler\": { \"speed_mps\": " << doppler_speed_ms << " }";
            asterix_blocks.push_back(dop.str());
        }

        std::ostringstream raw_asterix;
        raw_asterix << "\"raw_asterix\": {\n";
        for(size_t i = 0; i < asterix_blocks.size(); ++i) {
            raw_asterix << "    " << asterix_blocks[i] << (i < asterix_blocks.size() - 1 ? ",\n" : "\n");
        }
        raw_asterix << "  }";

        // 2. Build TACTICAL DATA Block
        std::vector<std::string> tac_blocks;
        tac_blocks.push_back("\"classification\": \"" + classification + "\"");
        tac_blocks.push_back("\"threat_score\": " + std::to_string(threat_score));
        
        // Was: `if (cartesian_x != 0.0 || cartesian_y != 0.0)` - a target
        // that happens to sit exactly on the anchor's x or y axis (e.g.
        // azimuth_deg == 0.0 puts cartesian_x at exactly 0.0) would lose the
        // entire geospatial block. calculateCoordinates() in ThreatAnalyzer
        // only runs when a position was actually decoded, so has_position is
        // the correct signal for "was geospatial data computed" here too.
        if (has_position) {
            std::ostringstream geo; 
            geo << std::fixed << std::setprecision(6) 
                << "\"geospatial\": { \"x_m\": " << cartesian_x << ", \"y_m\": " << cartesian_y 
                << ", \"lat\": " << latitude << ", \"lon\": " << longitude << " }";
            tac_blocks.push_back(geo.str());
        }
        
        if (!prediction_line.empty()) {
            std::ostringstream pred; 
            pred << "\"predictions\": [\n";
            for (size_t i = 0; i < prediction_line.size(); ++i) {
                // Change keys to x_offset_m and y_offset_m
                pred << std::fixed << std::setprecision(2) 
                     << "        { \"x_offset_m\": " << prediction_line[i].first << ", \"y_offset_m\": " << prediction_line[i].second << " }";
                pred << (i < prediction_line.size() - 1 ? ",\n" : "\n");
            }
            pred << "      ]";
            tac_blocks.push_back(pred.str());
        }
        
        std::ostringstream tactical_data;
        tactical_data << "\"tactical_data\": {\n";
        for(size_t i = 0; i < tac_blocks.size(); ++i) {
            tactical_data << "    " << tac_blocks[i] << (i < tac_blocks.size() - 1 ? ",\n" : "\n");
        }
        tactical_data << "  }";

        // 3. Assemble Final JSON
        out << "{\n";
        out << "  \"track_id\": " << track_number << ",\n";
        out << "  " << raw_asterix.str() << ",\n";
        out << "  " << tactical_data.str() << "\n";
        out << "}";
        
        return out.str();
    }
};
