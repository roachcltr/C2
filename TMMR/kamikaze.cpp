#include <iostream>
#include <vector>
#include <cmath>
#include <chrono>
#include <thread>
#include <random>
#include <iomanip>
#include <algorithm>
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
    const char* TARGET_IP = "127.0.0.1"; 
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
    // 2. KINEMATIC PROFILES (Kamikaze Drone Swarm)
    // ==========================================
    struct Target {
        uint16_t track_id;
        double pos_x;        // meters
        double pos_y;        // meters
        double altitude_m;   // meters
        double heading;      // radians
        double speed;        // m/s
        double turn_rate;    // radians per sweep
        int age_sweeps;

        double accel;        // m/s change per sweep
        double climb_rate;   // meters change per sweep
    };

    // --- Operational boundaries: keeps every drone inside the camera's tracking volume ---
    const double BOX_LIMIT_M  = 500.0;  // X and Y confined to +/- 500m
    const double MAX_ALT_M    = 150.0;  // hard ceiling
    const double MIN_ALT_M    = 5.0;    // just above ground level
    const double MIN_SPEED_MS = 15.0;   // ~54 km/h, typical loiter speed
    const double MAX_SPEED_MS = 45.0;   // ~162 km/h, terminal dash speed

    // Spawning 3 drones spread across the box to stress the tracker
    std::vector<Target> targets = {
        {7777,    0.0,    0.0,  80.0, 0.0,  25.0, 0.0, 0, 0.0, 0.0},
        {7778,  200.0, -150.0,  60.0, 2.1,  20.0, 0.0, 0, 0.0, 0.0},
        {7779, -250.0,  100.0, 100.0, 4.5,  30.0, 0.0, 0, 0.0, 0.0}
    };

    // Setup Random Noise Generators
    std::random_device rd;
    std::mt19937 gen(rd());
    std::normal_distribution<double> pos_noise(0.0, 5.0);   // meters
    std::normal_distribution<double> alt_noise(0.0, 3.0);   // meters
    std::normal_distribution<double> speed_noise(0.0, 1.0); // m/s
    std::uniform_int_distribution<int> coast_chance(1, 100);

    // Setup Random Behavior Generators
    std::uniform_int_distribution<int> maneuver_trigger(1, 100);
    std::uniform_real_distribution<double> rand_turn(-0.30, 0.30);  // sharp maneuvers
    std::uniform_real_distribution<double> rand_accel(-5.0, 5.0);   // throttle changes
    std::uniform_real_distribution<double> rand_climb(-8.0, 8.0);   // climb/dive rate (m/sweep)

    std::cout << "[SYSTEM] TMMR MIL-STD CAT-048 Simulator Online.\n";
    std::cout << "[SYSTEM] KAMIKAZE DRONE SWARM Stress Test Profile Engaged ("
              << targets.size() << " tracks).\n\n";

    // ==========================================
    // 3. MAIN RADAR LOOP
    // ==========================================
    while (true) {
        for (auto& tg : targets) {

            // --- A. THE CHAOS ENGINE ---
            // 15% chance every radar sweep that the drone violently changes intent
            if (maneuver_trigger(gen) <= 15) {
                tg.turn_rate = rand_turn(gen);
                tg.accel = rand_accel(gen);
                tg.climb_rate = rand_climb(gen);

                std::cout << "\n[!] DRONE MANEUVER (Track " << tg.track_id << "): Turn: "
                          << std::fixed << std::setprecision(2) << tg.turn_rate
                          << " | Accel: " << tg.accel << " | Climb: " << tg.climb_rate << "\n";
            }

            // --- B. ADVANCED PHYSICS & STATUS LOGIC ---
            tg.speed += tg.accel;
            if (tg.speed > MAX_SPEED_MS) { tg.speed = MAX_SPEED_MS; tg.accel = 0.0; }
            if (tg.speed < MIN_SPEED_MS) { tg.speed = MIN_SPEED_MS; tg.accel = 0.0; }

            tg.altitude_m += tg.climb_rate;
            if (tg.altitude_m > MAX_ALT_M) { tg.altitude_m = MAX_ALT_M; tg.climb_rate = 0.0; }
            if (tg.altitude_m < MIN_ALT_M) { tg.altitude_m = MIN_ALT_M;  tg.climb_rate = 0.0; }

            tg.heading += tg.turn_rate;
            tg.pos_x += tg.speed * cos(tg.heading);
            tg.pos_y += tg.speed * sin(tg.heading);
            tg.age_sweeps++;

            // --- Keep the drone inside the 500m box for the tracking camera ---
            double dist_from_origin = std::sqrt(tg.pos_x * tg.pos_x + tg.pos_y * tg.pos_y);
            if (dist_from_origin > BOX_LIMIT_M) {
                double bearing_to_center = std::atan2(-tg.pos_y, -tg.pos_x);
                double heading_error = bearing_to_center - tg.heading;
                while (heading_error > M_PI)  heading_error -= 2.0 * M_PI;
                while (heading_error < -M_PI) heading_error += 2.0 * M_PI;
                // Hard bank back toward center so the box is never breached
                tg.turn_rate = std::max(-0.30, std::min(0.30, heading_error));
                double scale = BOX_LIMIT_M / dist_from_origin;
                tg.pos_x *= scale;
                tg.pos_y *= scale;
            }

            // Apply RF Noise
            double radar_pos_x = tg.pos_x;
            double radar_pos_y = tg.pos_y;
            double radar_alt = tg.altitude_m + alt_noise(gen);
            double radar_speed = std::max(0.0, tg.speed + speed_noise(gen));

            // --- C. ASTERIX MATHEMATICAL CONVERSIONS ---
            auto now = std::chrono::system_clock::now();
            time_t tnow = std::chrono::system_clock::to_time_t(now);
            tm *date = std::localtime(&tnow);
            double seconds_since_midnight = (date->tm_hour * 3600) + (date->tm_min * 60) + date->tm_sec;
            uint32_t asterix_time = static_cast<uint32_t>(seconds_since_midnight * 128.0);

            double range_nm = std::sqrt(radar_pos_x * radar_pos_x + radar_pos_y * radar_pos_y) / 1852.0;
            uint16_t asterix_rho = static_cast<uint16_t>(range_nm * 256.0);
            double azimuth_deg = std::atan2(radar_pos_x, radar_pos_y) * (180.0 / M_PI);
            if (azimuth_deg < 0.0) azimuth_deg += 360.0;
            uint16_t asterix_theta = static_cast<uint16_t>(azimuth_deg * (65536.0 / 360.0));

            uint8_t simulated_snr = 80;

            uint16_t asterix_speed = static_cast<uint16_t>((radar_speed / 1852.0) * 16384.0);
            double velocity_heading_deg = std::atan2(cos(tg.heading), sin(tg.heading)) * (180.0 / M_PI);
            if (velocity_heading_deg < 0.0) velocity_heading_deg += 360.0;
            uint16_t asterix_vel_heading = static_cast<uint16_t>(velocity_heading_deg * (65536.0 / 360.0));

            // Dynamic Track Status Flags
            uint8_t track_status = 0x00;
            if (tg.age_sweeps < 3) track_status |= 0x80;
            if (std::abs(tg.turn_rate) >= 0.05) track_status |= 0x10;
            if (coast_chance(gen) <= 10 && tg.age_sweeps > 5) track_status |= 0x20;

            if (!(track_status & 0x20)) {
                radar_pos_x += pos_noise(gen);
                radar_pos_y += pos_noise(gen);
            }

            // Convert meters -> feet only for the ASTERIX 25ft-resolution height field
            double altitude_ft_equiv = radar_alt * 3.28084;
            int16_t asterix_3d_height = static_cast<int16_t>(altitude_ft_equiv / 25.0);
            uint8_t doppler_byte = static_cast<uint8_t>(radar_speed) << 1;

            // --- D. CONSTRUCT THE ASTERIX BYTE STREAM ---
            std::vector<uint8_t> packet;

            packet.push_back(0x30);
            packet.push_back(0x00);
            packet.push_back(0x00);

            packet.push_back(0xF3);
            packet.push_back(0x17);
            packet.push_back(0x0C);

            packet.push_back(0x03);
            packet.push_back(0x30);

            packet.push_back((asterix_time >> 16) & 0xFF);
            packet.push_back((asterix_time >> 8) & 0xFF);
            packet.push_back(asterix_time & 0xFF);

            packet.push_back(0x20);

            append_16(packet, asterix_rho);
            append_16(packet, asterix_theta);

            packet.push_back(0x08);
            packet.push_back(simulated_snr);

            append_16(packet, tg.track_id);

            append_16(packet, asterix_speed);
            append_16(packet, asterix_vel_heading);

            packet.push_back(track_status);

            packet.push_back((asterix_3d_height >> 8) & 0xFF);
            packet.push_back(asterix_3d_height & 0xFF);

            doppler_byte &= 0xFE;
            packet.push_back(doppler_byte);

            uint16_t total_length = packet.size();
            packet[1] = (total_length >> 8) & 0xFF;
            packet[2] = total_length & 0xFF;

            // --- E. TRANSMIT OVER NETWORK ---
            sendto(sock, packet.data(), packet.size(), 0, (struct sockaddr*)&target_addr, sizeof(target_addr));

            // Simplified Output for speed
            std::cout << "> ASTERIX Tx [" << total_length << " Bytes] | Track: " << tg.track_id
                      << " | Pos: (" << std::fixed << std::setprecision(1) << tg.pos_x << ", " << tg.pos_y << ")"
                      << " | Alt: " << tg.altitude_m << "m | Spd: " << tg.speed << "m/s"
                      << " | Status: 0x" << std::hex << (int)track_status << std::dec << "\n";
        }

        // One update per full radar rotation, applied to every track
        std::this_thread::sleep_for(std::chrono::milliseconds(60000 / RADAR_RPM));
    }

    close(sock);
    return 0;
}
