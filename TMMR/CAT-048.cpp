#include <iostream>
#include <vector>
#include <cmath>
#include <chrono>
#include <thread>
#include <random>
#include <iomanip>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <unistd.h>

// Helper function to append 16-bit integers (Big-Endian format for network/ASTERIX)
void append_16(std::vector<uint8_t>& buffer, uint16_t value) {
    buffer.push_back((value >> 8) & 0xFF);
    buffer.push_back(value & 0xFF);
}

int main() {
    // ==========================================
    // 1. NETWORK & RADAR CONFIGURATION
    // ==========================================
    const char* TARGET_IP = "255.255.255.255"; 
    const int TARGET_PORT = 12345;
    const int RADAR_RPM = 60; 

    // Setup UDP Broadcast Socket
    int sock = socket(AF_INET, SOCK_DGRAM, 0);
    if (sock < 0) {
        std::cerr << "[ERROR] Failed to create socket.\n";
        return 1;
    }

    int broadcastEnable = 1;
    setsockopt(sock, SOL_SOCKET, SO_BROADCAST, &broadcastEnable, sizeof(broadcastEnable));

    sockaddr_in target_addr{};
    target_addr.sin_family = AF_INET;
    target_addr.sin_port = htons(TARGET_PORT);
    inet_pton(AF_INET, TARGET_IP, &target_addr.sin_addr);

    // ==========================================
    // 2. KINEMATIC PROFILES (Internal True State)
    // ==========================================
    struct Target {
        uint16_t track_id;
        double pos_x;
        double pos_y;
        double altitude_ft;
        double heading;
        double speed;
        double turn_rate; // Radians per sweep for maneuvering
        int age_sweeps;   // How long the radar has tracked it
    };

    // 15 anomaly profiles
    std::vector<Target> targets = {
        // 1042 - High-speed fighter performing a large orbit
        {1042, 6000.0, 0.0, 24500.0, 10, 400.0, 0.05, 50},
    };

    // Setup Random Noise Generators (Simulating RF environment)
    std::random_device rd;
    std::mt19937 gen(rd());
    std::normal_distribution<double> pos_noise(0.0, 15.0); 
    std::normal_distribution<double> alt_noise(0.0, 50.0); 
    std::normal_distribution<double> speed_noise(0.0, 5.0); 
    std::uniform_int_distribution<int> coast_chance(1, 100);

    std::cout << "[SYSTEM] TMMR MIL-STD CAT-048 Simulator Online.\n";
    std::cout << "[SYSTEM] Advanced Tracker Physics Enabled.\n\n";

    // ==========================================
    // 3. MAIN RADAR LOOP
    // ==========================================
    while (true) {
        for (auto& tg : targets) {
            
            // --- A. ADVANCED PHYSICS & STATUS LOGIC ---
                tg.heading += tg.turn_rate; // Apply curve maneuver
                tg.pos_x += tg.speed * cos(tg.heading);
                tg.pos_y += tg.speed * sin(tg.heading);
                tg.age_sweeps++;
                // Apply RF Noise (unless the radar lost the target and is coasting/guessing)
                double radar_pos_x = tg.pos_x;
                double radar_pos_y = tg.pos_y;
                double radar_alt = tg.altitude_ft + alt_noise(gen);
                double radar_speed = std::max(0.0, tg.speed + speed_noise(gen));

            // --- B. ASTERIX MATHEMATICAL CONVERSIONS ---
                // --------- TIME (FRN2) ---------
                auto now = std::chrono::system_clock::now();
                time_t tnow = std::chrono::system_clock::to_time_t(now);
                tm *date = std::localtime(&tnow);
                double seconds_since_midnight = (date->tm_hour * 3600) + (date->tm_min * 60) + date->tm_sec;
                uint32_t asterix_time = static_cast<uint32_t>(seconds_since_midnight * 128.0);

                // --------- POSITION (FRN4) ---------
                // Range (1 LSB = 1/256 NM)
                double range_nm = std::sqrt(radar_pos_x * radar_pos_x + radar_pos_y * radar_pos_y) / 1852.0;
                uint16_t asterix_rho = static_cast<uint16_t>(range_nm * 256.0);
                // Azimuth (1 LSB = 360 / 2^16 deg)
                double azimuth_deg = std::atan2(radar_pos_x, radar_pos_y) * (180.0 / M_PI);
                if (azimuth_deg < 0.0) azimuth_deg += 360.0;
                uint16_t asterix_theta = static_cast<uint16_t>(azimuth_deg * (65536.0 / 360.0));

                // --------- RADAR PLOT CHARACTERISTIC (FRN7) ---------
                uint8_t simulated_snr = 80; 

                // --------- VELOCITY (FRN 13) ---------
                // Velocity (1 LSB = 1/16384 NM/s converted from m/s)
                uint16_t asterix_speed = static_cast<uint16_t>((radar_speed / 1852.0) * 16384.0);
                // Velocity Heading (1 LSB = 360 / 2^16 deg)
                double velocity_heading_deg = std::atan2(cos(tg.heading), sin(tg.heading)) * (180.0 / M_PI);
                if (velocity_heading_deg < 0.0) velocity_heading_deg += 360.0;
                uint16_t asterix_vel_heading = static_cast<uint16_t>(velocity_heading_deg * (65536.0 / 360.0));

                // --------- TRACK STATUS (FRN 14) ---------
                uint8_t track_status = 0x00; // Default: Confirmed, Alive, Valid
                if (tg.age_sweeps < 3) track_status |= 0x80;            // Rule 1: Tentative Track
                if (std::abs(tg.turn_rate) >= 0.05) track_status |= 0x10;// Rule 2: Maneuvering Track
                if (coast_chance(gen) <= 10 && tg.age_sweeps > 5) {     // Rule 3: Coasting (Clutter loss)
                    track_status |= 0x20;
                }
                if (!(track_status & 0x20)) { 
                    radar_pos_x += pos_noise(gen);
                    radar_pos_y += pos_noise(gen);
                }

                // --------- ALTITUDE (FRN 19) ---------
                // 3D Height (1 LSB = 25 ft) - Replaces standard Flight Level for PSR
                int16_t asterix_3d_height = static_cast<int16_t>(radar_alt / 25.0);
                
                // --------- RADIAL DOPPLER SPEED (FRN 20) ---------
                // Convert to a signed 16-bit integer to handle high speeds and negative velocities
                int16_t doppler_val = static_cast<int16_t>(radar_speed); 
                std::vector<uint8_t> doppler_bytes;

                // Check if the value fits in a single 7-bit chunk (-64 to +63)
                if (doppler_val >= -64 && doppler_val <= 63) {
                    // Fits in 1 byte. Shift left by 1, leave FX bit (Bit 0) as 0.
                    uint8_t b1 = (static_cast<uint8_t>(doppler_val & 0x7F) << 1) | 0x00;
                    doppler_bytes.push_back(b1);
                } else {
                    // Exceeds 1 byte. Pack into 2 bytes (-8192 to +8191).
                    // Byte 1: Top 7 bits. Set FX bit to 1.
                    uint8_t b1 = (static_cast<uint8_t>((doppler_val >> 7) & 0x7F) << 1) | 0x01; 
                    // Byte 2: Bottom 7 bits. Set FX bit to 0 (end of chain).
                    uint8_t b2 = (static_cast<uint8_t>(doppler_val & 0x7F) << 1) | 0x00;        
                    doppler_bytes.push_back(b1);
                    doppler_bytes.push_back(b2);
                }

            // --- C. CONSTRUCT THE ASTERIX BYTE STREAM ---
                std::vector<uint8_t> packet;

                // Header
                packet.push_back(0x30); // Category 048
                packet.push_back(0x00); // Length MSB (Placeholder)
                packet.push_back(0x00); // Length LSB (Placeholder)
                
                // FSPEC (Field Specification) - 3 Bytes to reach FRN 19
                packet.push_back(0xF3); // Byte 1: FRN 1, 2, 3, 4, 7 are ON. FX is ON.
                packet.push_back(0x17); // Byte 2: FRN 11, 13, 14 are ON. FX is ON.
                packet.push_back(0x0C); // Byte 3: FRN 19, 20 are ON. FX is OFF.

                // FRN 1: I048/010 Data Source Identifier
                packet.push_back(0x03); // SAC
                packet.push_back(0x30); // SIC

                // FRN 2: I048/140 Time of Day (3 Bytes)
                packet.push_back((asterix_time >> 16) & 0xFF);
                packet.push_back((asterix_time >> 8) & 0xFF);
                packet.push_back(asterix_time & 0xFF);

                // FRN 3: I048/020 Target Report Descriptor (1 Byte)
                packet.push_back(0x20); // 0x20 = Primary Radar Target

                // FRN 4: I048/040 Measured Position (4 Bytes)
                append_16(packet, asterix_rho);
                append_16(packet, asterix_theta);

                // FRN 7: I048/130 Radar Plot Characteristics (Compound Field)
                packet.push_back(0x08); 
                packet.push_back(simulated_snr);
                
                // FRN 11: I048/161 Track Number (2 Bytes)
                append_16(packet, tg.track_id);

                // FRN 13: I048/200 Calculated Track Velocity (4 Bytes)
                append_16(packet, asterix_speed);
                append_16(packet, asterix_vel_heading);
                
                // FRN 14: I048/170 Track Status (1 Byte)
                packet.push_back(track_status); 

                // FRN 19: I048/110 Height Measured by 3D Radar (2 Bytes)
                packet.push_back((asterix_3d_height >> 8) & 0xFF);
                packet.push_back(asterix_3d_height & 0xFF);
                
                // FRN 20: I048/120 Radial Doppler Speed (Variable Length 1+ Bytes)
                for (uint8_t b : doppler_bytes) {
                    packet.push_back(b);
                }

                // Finalize Packet Length
                uint16_t total_length = packet.size();
                packet[1] = (total_length >> 8) & 0xFF;
                packet[2] = total_length & 0xFF;

            // --- D. TRANSMIT OVER NETWORK ---
                sendto(sock, packet.data(), packet.size(), 0, (struct sockaddr*)&target_addr, sizeof(target_addr));

                // --- DETAILED CONSOLE OUTPUT (Visual Dissector) ---
                std::cout << "\n> ASTERIX Tx [" << total_length << " Bytes] | Target ID: " << tg.track_id << "\n";
                std::cout << std::string(50, '-') << "\n";

                // Lambda helper to print specific slices of the packet array
                auto print_block = [&](const std::string& label, int start_idx, int len) {
                    std::cout << "  " << std::left << std::setw(18) << label << ": ";
                    for (int i = 0; i < len; ++i) {
                        std::cout << std::hex << std::setw(2) << std::setfill('0') << static_cast<int>(packet[start_idx + i]) << " ";
                    }
                    std::cout << std::dec << "\n"; // Reset to decimal
                };

                // Print each block based on its exact byte length and position
                print_block("HEADER (CAT/Len)  ", 0, 3);
                print_block("FSPEC             ",            3, 3);
                print_block("FRN  1 (Source)   ",  6, 2);
                print_block("FRN  2 (Time)     ",    8, 3);
                print_block("FRN  3 (Desc)     ",    11, 1);
                print_block("FRN  4 (Position) ", 12, 4);
                print_block("FRN  7 (SNR)      ",     16, 2);
                print_block("FRN 11 (Track ID) ", 18, 2);
                print_block("FRN 13 (Velocity) ", 20, 4);
                print_block("FRN 14 (Status)   ",   24, 1);
                print_block("FRN 19 (3D Height)",25, 2);
                print_block("FRN 20 (Doppler)  ",  27, 1);
                
                std::cout << std::string(50, '-') << "\n";
                
                // Pace the output according to radar RPM
                std::this_thread::sleep_for(std::chrono::milliseconds(4000 / RADAR_RPM));
        }
    }

    close(sock);
    return 0;
}