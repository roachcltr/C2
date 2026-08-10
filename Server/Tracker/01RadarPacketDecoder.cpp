// (formerly "AsterixParser.cpp" - see 01_RadarPacketDecoder.h for what this
// file's job is in the overall pipeline)

#include "01RadarPacketDecoder.h"
#include <cmath>
#include <cstdio>
#include <iostream>

// --- BOUNDS-CHECK HELPERS ---
// Every FRN case below reads a known, fixed (or boundable) number of bytes
// starting at `offset`. Before, only ONE check existed at the very top of
// the bit loop (offset >= packet.size()), which only guarantees the FIRST
// byte of a field is in range - not the 2nd/3rd/4th byte a given FRN needs.
// A truncated or malformed UDP packet (dropped fragment, bad actor sending
// garbage at the radar port, etc.) would walk packet[offset+N] straight off
// the end of the vector -> undefined behavior. has_bytes() centralizes the
// "do we have N more bytes from here" check so every case can guard itself
// in one line instead of hand-rolling arithmetic each time.
static inline bool has_bytes(const std::vector<uint8_t>& packet, size_t offset, size_t n) {
    if (offset > packet.size()) return false;
    return (packet.size() - offset) >= n;
}

// Advances `offset` past an "extension bit" (FX bit, LSB) chain, i.e. fields
// like FRN 3/14/16/20 where you keep reading bytes while bit0 == 1.
// Returns false if the buffer ran out before the chain terminated, so the
// caller can bail out cleanly instead of reading garbage.
static inline bool skip_fx_chain(const std::vector<uint8_t>& packet, size_t& offset) {
    if (offset >= packet.size()) return false;
    while (packet[offset] & 0x01) {
        offset++;
        if (offset >= packet.size()) return false; // ran off the end mid-chain
    }
    offset++; // consume the final (non-extended) byte
    return true;
}

RadarTrack decodeRadarPacket(const std::vector<uint8_t>& packet) {
    RadarTrack record;
    
    // 1. Header Validation
    if (packet.size() < 3) { 
        record.error_msg = "Packet too short";
        return record;
    }
    
    record.category = packet[0];
    if (record.category != 0x30) { 
        record.error_msg = "Unknown category: " + std::to_string(record.category);
        return record;
    }

    record.length = (packet[1] << 8) | packet[2];
    if (packet.size() < static_cast<size_t>(record.length)) {
        record.error_msg = "Data truncated during transmission";
        return record;
    }

    record.valid = true;
    size_t offset = 3;
    
    // 2. Dynamic FSPEC Reading
    std::vector<uint8_t> fspec;
    while (offset < packet.size()) {
        uint8_t current_fspec = packet[offset++];
        fspec.push_back(current_fspec);
        if (!(current_fspec & 0x01)) break;
    }

    // 3. Dynamic UAP Dictionary Processing
    int frn = 1; 

    for (size_t i = 0; i < fspec.size(); ++i) {
        uint8_t current_fspec = fspec[i];
        
        for (int bit = 7; bit >= 1; --bit) {
            if (current_fspec & (1 << bit)) {
                
                if (offset >= packet.size()) return record; // Safety bounds check
                
                switch (frn) {
                    case 1: // I048/010 Data Source
                        if (!has_bytes(packet, offset, 2)) {
                            record.error_msg = "Truncated FRN1 (Data Source)";
                            return record;
                        }
                        record.sac = packet[offset];
                        record.sic = packet[offset+1];
                        offset += 2; break;
                        
                    case 2: // I048/140 Time of Day
                        {
                            if (!has_bytes(packet, offset, 3)) {
                                record.error_msg = "Truncated FRN2 (Time of Day)";
                                return record;
                            }
                            uint32_t time_asterix = (packet[offset] << 16) | (packet[offset+1] << 8) | packet[offset+2];
                            record.raw_seconds = time_asterix / 128.0;
                            int h = static_cast<int>(record.raw_seconds) / 3600;
                            int m = (static_cast<int>(record.raw_seconds) % 3600) / 60;
                            double s = std::fmod(record.raw_seconds, 60.0);
                            char time_buf[64]; 
                            snprintf(time_buf, sizeof(time_buf), "%02d:%02d:%05.2f", h, m, s);
                            record.formatted_time = time_buf;
                            record.has_time = true;
                            offset += 3;
                        }
                        break;
                        
                    case 3: // I048/020 Target Report Descriptor
                        record.target_descriptor = packet[offset];
                        if (!skip_fx_chain(packet, offset)) {
                            record.error_msg = "Truncated FRN3 (Target Descriptor)";
                            return record;
                        }
                        break;
                        
                    case 4: // I048/040 Measured Position
                        {
                            if (!has_bytes(packet, offset, 4)) {
                                record.error_msg = "Truncated FRN4 (Measured Position)";
                                return record;
                            }
                            uint16_t rho = (packet[offset] << 8) | packet[offset+1];
                            uint16_t theta = (packet[offset+2] << 8) | packet[offset+3];
                            record.range_nm = rho / 256.0;
                            record.range_meters = record.range_nm * 1852.0;
                            record.azimuth_deg = theta * (360.0 / 65536.0);
                            record.has_position = true;
                            offset += 4;
                        }
                        break;
                        
                    case 5: // I048/070 Mode 3/A
                        if (!has_bytes(packet, offset, 2)) {
                            record.error_msg = "Truncated FRN5 (Mode 3/A)";
                            return record;
                        }
                        offset += 2; break;
                        
                    case 6: // I048/090 Flight Level
                        {
                            if (!has_bytes(packet, offset, 2)) {
                                record.error_msg = "Truncated FRN6 (Flight Level)";
                                return record;
                            }
                            int16_t fl_raw = (packet[offset] << 8) | packet[offset+1];
                            record.flight_level = fl_raw / 4.0;
                            record.has_altitude = true;
                            offset += 2;
                        }
                        break;
                        
                    case 7: // I048/130 Radar Plot Characteristics (Compound)
                        {
                            size_t sub_len = 1;
                            while (true) {
                                if (!has_bytes(packet, offset, sub_len)) {
                                    record.error_msg = "Truncated FRN7 sub-FSPEC";
                                    return record;
                                }
                                if (!(packet[offset + sub_len - 1] & 0x01)) break;
                                sub_len++;
                            }
                            
                            size_t data_index = offset + sub_len;
                            for (size_t k = 0; k < sub_len; k++) {
                                uint8_t sf = packet[offset + k];
                                
                                for (int b = 7; b >= 1; b--) {
                                    if (sf & (1 << b)) {
                                        // Calculate exact subfield index (1-based)
                                        int sf_index = static_cast<int>(k * 7 + (7 - b) + 1);
                                        
                                        // Process specific data if we need it
                                        if (sf_index == 5) { // Subfield 5 is PSR Amplitude
                                            if (!has_bytes(packet, data_index, 1)) return record;
                                            record.snr = packet[data_index];
                                        }

                                        // Advance data_index safely based on known subfield definitions
                                        switch (sf_index) {
                                            case 1: // SRL (1 byte)
                                            case 2: // SRR (1 byte)
                                            case 3: // SAM (1 byte)
                                            case 4: // PRL (1 byte)
                                            case 5: // PAM (1 byte)
                                            case 6: // RVD (1 byte)
                                            case 7: // SUV (1 byte)
                                                data_index += 1; 
                                                break;
                                            default:
                                                // If we hit an unknown subfield, we cannot safely guess its length.
                                                // We must abort parsing this specific packet to prevent misaligning 
                                                // the FRNs that come after it.
                                                record.error_msg = "Unknown FRN7 subfield length detected";
                                                return record;
                                        }
                                    }
                                }
                            }
                            offset = data_index; // Update master offset
                        }
                        break;
                        
                    case 8: // I048/220 Aircraft Address
                        if (!has_bytes(packet, offset, 3)) {
                            record.error_msg = "Truncated FRN8 (Aircraft Address)";
                            return record;
                        }
                        offset += 3; break;

                    case 9: // I048/240 Aircraft ID
                        if (!has_bytes(packet, offset, 6)) {
                            record.error_msg = "Truncated FRN9 (Aircraft ID)";
                            return record;
                        }
                        offset += 6; break;

                    case 10: // I048/250 Mode S MB Data
                        {
                            if (!has_bytes(packet, offset, 1)) {
                                record.error_msg = "Truncated FRN10 (Mode S length byte)";
                                return record;
                            }
                            size_t mb_len = 1 + static_cast<size_t>(packet[offset]) * 8;
                            if (!has_bytes(packet, offset, mb_len)) {
                                record.error_msg = "Truncated FRN10 (Mode S MB Data)";
                                return record;
                            }
                            offset += mb_len;
                        }
                        break;
                        
                    case 11: // I048/161 Track Number
                        if (!has_bytes(packet, offset, 2)) {
                            record.error_msg = "Truncated FRN11 (Track Number)";
                            return record;
                        }
                        record.track_number = (packet[offset] << 8) | packet[offset+1];
                        offset += 2; break;
                        
                    case 12: // I048/042 Calculated Position X/Y
                        if (!has_bytes(packet, offset, 4)) {
                            record.error_msg = "Truncated FRN12 (Calculated Position)";
                            return record;
                        }
                        offset += 4; break;
                        
                    case 13: // I048/200 Calculated Velocity
                        {
                            if (!has_bytes(packet, offset, 4)) {
                                record.error_msg = "Truncated FRN13 (Calculated Velocity)";
                                return record;
                            }
                            uint16_t speed_raw = (packet[offset] << 8) | packet[offset+1];
                            uint16_t heading_raw = (packet[offset+2] << 8) | packet[offset+3];
                            record.speed_ms = (speed_raw / 16384.0) * 1852.0;
                            record.heading_deg = heading_raw * (360.0 / 65536.0);
                            record.has_velocity = true;
                            offset += 4;
                        }
                        break;
                        
                    case 14: // I048/170 Track Status
                        record.track_status = packet[offset];
                        if (!skip_fx_chain(packet, offset)) {
                            record.error_msg = "Truncated FRN14 (Track Status)";
                            return record;
                        }
                        break;

                    // --- SAFE FALLBACKS TO REACH FRN 19 ---
                    case 15: // I048/210 Track Quality
                        if (!has_bytes(packet, offset, 4)) {
                            record.error_msg = "Truncated FRN15 (Track Quality)";
                            return record;
                        }
                        offset += 4; break;

                    case 16: // I048/030 Warning
                        if (!skip_fx_chain(packet, offset)) {
                            record.error_msg = "Truncated FRN16 (Warning)";
                            return record;
                        }
                        break;

                    case 17: // I048/080 Mode-3/A Confidence
                        if (!has_bytes(packet, offset, 2)) {
                            record.error_msg = "Truncated FRN17 (Mode-3/A Confidence)";
                            return record;
                        }
                        offset += 2; break;

                    case 18: // I048/100 Mode-C Confidence
                        if (!has_bytes(packet, offset, 4)) {
                            record.error_msg = "Truncated FRN18 (Mode-C Confidence)";
                            return record;
                        }
                        offset += 4; break;

                    case 19: // I048/110 Height Measured by 3D Radar
                        {
                            if (!has_bytes(packet, offset, 2)) {
                                record.error_msg = "Truncated FRN19 (3D Height)";
                                return record;
                            }
                            int16_t height_raw = (packet[offset] << 8) | packet[offset+1];
                            record.altitude_ft = static_cast<double>(height_raw) * 25.0;
                            record.has_altitude = true;
                            offset += 2;
                        }
                        break;

                    case 20: // I048/120 Radial Doppler Speed
                        {
                            uint32_t raw_val = 0;
                            int bit_count = 0;
                            
                            // 1. Accumulate all 7-bit chunks in the FX chain
                            while (true) {
                                if (!has_bytes(packet, offset, 1)) {
                                    record.error_msg = "Truncated FRN20 (Doppler)";
                                    return record;
                                }
                                uint8_t b = packet[offset++];
                                
                                // Shift accumulator by 7 and drop in the new bits (Bits 7-1)
                                raw_val = (raw_val << 7) | (b >> 1);
                                bit_count += 7;
                                
                                // Break if the FX bit (Bit 0) is 0
                                if (!(b & 0x01)) break;
                            }
                            
                            // 2. ASTERIX Two's Complement Sign Extension
                            uint32_t sign_bit = 1 << (bit_count - 1);
                            if (raw_val & sign_bit) {
                                // If the number is negative, pad all the upper bits with 1s
                                uint32_t mask = ~((1 << bit_count) - 1);
                                raw_val |= mask;
                            }
                            
                            // 3. Cast to a signed 32-bit int, then to double
                            record.doppler_speed_ms = static_cast<double>(static_cast<int32_t>(raw_val));
                            record.has_doppler = true;
                        }
                        break;
                    default:
                        std::cerr << "[WARNING] Unmapped FRN " << frn << " detected. Safely truncating read.\n";
                        return record;
                }
            }
            frn++; 
        }
    }
    
    return record;
}
