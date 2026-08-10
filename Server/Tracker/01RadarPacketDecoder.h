#pragma once
#include <vector>
#include <cstdint>
#include "02RadarTrack.h"

// ============================================================================
// STAGE 1 OF THE PIPELINE: raw bytes -> structured data
// ============================================================================
// (formerly "AsterixParser.h")
//
// Every radar on the truck speaks a real aviation-industry wire format
// called ASTERIX Category 048 (EUROCONTROL's standard for "here is a radar
// plot/track"). It is NOT something invented for this project - it's the
// same kind of thing as decoding a GPS NMEA sentence or a JPEG header: a
// fixed byte layout defined by an external spec.
//
// This file is the ONLY place in the codebase that needs to know that byte
// layout. It reads one UDP payload and turns it into a RadarTrack (see
// 02_RadarTrack.h) - the plain struct every other stage of the pipeline
// works with. Nothing downstream of this function ever looks at raw bytes
// again.
// ============================================================================

RadarTrack decodeRadarPacket(const std::vector<uint8_t>& packet);
