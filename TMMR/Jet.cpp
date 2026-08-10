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
    // 2. KINEMATIC PROFILES (The Chaos Jet)
    // ==========================================
    struct Target {
        uint16_t track_id;
        double pos_x;
        double pos_y;
        double altitude_ft;
        double heading;
        double speed;
        double turn_rate; // Radians per sweep
        int age_sweeps;   
        
        // --- NEW KINEMATIC STATES ---
        double accel;       // Speed change (m/s per sweep)
        double climb_rate;  // Altitude change (ft per sweep)
    };

    // Spawning a single jet to stress the tracker
    std::vector<Target> targets = {
        {7777, 0.0, 3000.0, 20000.0, 1.57, 250.0, 0.0, 0, 0.0, 0.0} 
    };

    // Setup Random Noise Generators
    std::random_device rd;
    std::mt19937 gen(rd());
    std::normal_distribution<double> pos_noise(0.0, 15.0); 
    std::normal_distribution<double> alt_noise(0.0, 50.0); 
    std::normal_distribution<double> speed_noise(0.0, 5.0); 
    std::uniform_int_distribution<int> coast_chance(1, 100);
    
    // Setup Random Behavior Generators
    std::uniform_int_distribution<int> maneuver_trigger(1, 100);
    std::uniform_real_distribution<double> rand_turn(-0.18, 0.18);   // Heavy G-turns
    std::uniform_real_distribution<double> rand_accel(-25.0, 25.0);  // Violent accel/braking
    std::uniform_real_distribution<double> rand_climb(-500.0, 500.0);// Rapid dive/climb

    std::cout << "[SYSTEM] TMMR MIL-STD CAT-048 Simulator Online.\n";
    std::cout << "[SYSTEM] CHAOS JET Stress Test Profile Engaged.\n\n";

    // ==========================================
    // 3. MAIN RADAR LOOP
    // ==========================================
    while (true) {
        for (auto& tg : targets) {
            
            // --- A. THE CHAOS ENGINE ---
            // 15% chance every radar sweep that the pilot violently changes intent
            if (maneuver_trigger(gen) <= 15) { 
                tg.turn_rate = rand_turn(gen);
                tg.accel = rand_accel(gen);
                tg.climb_rate = rand_climb(gen);
                
                std::cout << "\n[!] PILOT MANEUVER: Turn: " << std::fixed << std::setprecision(2) << tg.turn_rate 
                          << " | Accel: " << tg.accel << " | Climb: " << tg.climb_rate << "\n";
            }

            // --- B. ADVANCED PHYSICS & STATUS LOGIC ---
            tg.speed += tg.accel;
            // Physical boundaries (Keep it flying like a jet)
            if (tg.speed > 1500.0) { tg.speed = 1500.0; tg.accel = 0.0; }
            if (tg.speed < 800.0) { tg.speed = 800.0; tg.accel = 0.0; }

            tg.altitude_ft += tg.climb_rate;
            if (tg.altitude_ft > 45000.0) { tg.altitude_ft = 45000.0; tg.climb_rate = 0.0; }
            if (tg.altitude_ft < 1500.0)  { tg.altitude_ft = 1500.0;  tg.climb_rate = 0.0; }

            tg.heading += tg.turn_rate; 
            tg.pos_x += tg.speed * cos(tg.heading);
            tg.pos_y += tg.speed * sin(tg.heading);
            tg.age_sweeps++;

            // Apply RF Noise 
            double radar_pos_x = tg.pos_x;
            double radar_pos_y = tg.pos_y;
            double radar_alt = tg.altitude_ft + alt_noise(gen);
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

            int16_t asterix_3d_height = static_cast<int16_t>(radar_alt / 25.0);
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
                      << " | Status: 0x" << std::hex << (int)track_status << std::dec << "\n";
            
            std::this_thread::sleep_for(std::chrono::milliseconds(60000 / RADAR_RPM));
        }
    }

    close(sock);
    return 0;
}
