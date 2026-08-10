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

// Print packet in hexadecimal
void print_hex(const std::vector<uint8_t>& packet) {
    std::cout << "TX (" << packet.size() << " bytes): ";

    for (size_t i = 0; i < packet.size(); i++) {
        std::cout << std::uppercase
                  << std::hex
                  << std::setw(2)
                  << std::setfill('0')
                  << static_cast<int>(packet[i]) << " ";

        // Optional: Break every 16 bytes for readability
        if ((i + 1) % 16 == 0 && i + 1 < packet.size())
            std::cout << "\n                      ";
    }

    std::cout << std::dec << "\n\n";
}

// Helper to append 16-bit integers (Big-Endian for ASTERIX)
void append_16(std::vector<uint8_t>& buffer, uint16_t value) {
    buffer.push_back((value >> 8) & 0xFF);
    buffer.push_back(value & 0xFF);
}

int main() {
    // ==========================================
    // 1. VIDEO NETWORK CONFIGURATION
    // ==========================================
    const char* TARGET_IP = "255.255.255.255"; 
    const int VIDEO_PORT = 12347; 
    
    const int AZIMUTH_SPOKES = 360; 
    const int CELLS_PER_SPOKE = 256; 

    int sock = socket(AF_INET, SOCK_DGRAM, 0);
    if (sock < 0) return 1;

    int broadcastEnable = 1;
    setsockopt(sock, SOL_SOCKET, SO_BROADCAST, &broadcastEnable, sizeof(broadcastEnable));

    sockaddr_in target_addr{};
    target_addr.sin_family = AF_INET;
    target_addr.sin_port = htons(VIDEO_PORT);
    inet_pton(AF_INET, TARGET_IP, &target_addr.sin_addr);

    // Setup Generators
    std::random_device rd;
    std::mt19937 gen(rd());
    std::uniform_int_distribution<int> rf_noise(5, 35);
    std::uniform_real_distribution<double> rand_vel(-30.0, 30.0); // Random speed vector

    std::cout << "[SYSTEM] TMMR MIL-STD CAT-240 Video Simulator Online.\n";
    std::cout << "[SYSTEM] Broadcasting RAW Uncompressed Pixels on Port " << VIDEO_PORT << ".\n\n";

    double current_azimuth_deg = 0.0;

    // --- TARGET KINEMATICS SETUP ---
    // Track the target in Cartesian coordinates (X/Y) so it flies in straight lines.
    // Radar center is (0,0). North is +Y, East is +X.
    double target_x = 120.0; 
    double target_y = 0.0;
    
    // Initial velocity (cells per second)
    double target_vx = rand_vel(gen);
    double target_vy = rand_vel(gen);
    
    // Delta time: How much time passes per radar spoke (1 rotation/sec divided by 360 spokes)
    double dt = 1.0 / AZIMUTH_SPOKES;

    // ==========================================
    // 2. MAIN RADAR VIDEO LOOP
    // ==========================================
    while (true) {
        
        // --- A. UPDATE TARGET PHYSICS ---
        target_x += (target_vx * dt);
        target_y += (target_vy * dt);

        double target_range = std::sqrt(target_x*target_x + target_y*target_y);

        // Boundary Bounce: Keep it inside the 250-cell radar scope
        if (target_range > 245.0) {
            target_x -= (target_vx * dt); // Step back
            target_y -= (target_vy * dt);
            target_vx = rand_vel(gen);    // Pick a new random velocity
            target_vy = rand_vel(gen);
        }

        // Convert Cartesian (X/Y) to Polar (Azimuth/Range) for the radar to "see"
        // Note: atan2(x, y) puts 0 degrees at North and maps clockwise.
        double target_az_deg = std::atan2(target_x, target_y) * (180.0 / M_PI);
        if (target_az_deg < 0.0) target_az_deg += 360.0;

        // --- B. CALCULATE AZIMUTH ---
        uint16_t start_az = static_cast<uint16_t>(current_azimuth_deg * (65536.0 / 360.0));
        current_azimuth_deg += (360.0 / AZIMUTH_SPOKES);
        if (current_azimuth_deg >= 360.0) current_azimuth_deg -= 360.0;
        uint16_t end_az = static_cast<uint16_t>(current_azimuth_deg * (65536.0 / 360.0));

        // --- C. TIME CALCULATION ---
        auto now = std::chrono::system_clock::now();
        time_t tnow = std::chrono::system_clock::to_time_t(now);
        tm *date = std::localtime(&tnow);
        double seconds_since_midnight = (date->tm_hour * 3600) + (date->tm_min * 60) + date->tm_sec;
        uint32_t asterix_time = static_cast<uint32_t>(seconds_since_midnight * 128.0);

        // --- D. CONSTRUCT THE CAT-240 BYTE STREAM ---
        std::vector<uint8_t> packet;
        packet.push_back(240); 
        packet.push_back(0x00); 
        packet.push_back(0x00); 
        
        packet.push_back(0xE3); 
        packet.push_back(0x98); 
        packet.push_back(0x03); 
        packet.push_back(0x30); 
        packet.push_back(0x01); 

        append_16(packet, start_az);
        append_16(packet, end_az);

        packet.push_back(0x01); 
        packet.push_back(0x00); 

        packet.push_back(0x00); 
        append_16(packet, CELLS_PER_SPOKE + 1); 
        append_16(packet, CELLS_PER_SPOKE);     

        packet.push_back(0x01); 
        
        // --- INJECT PIXELS ---
        // Calculate how close the current radar sweep is to the target's true azimuth
        double az_diff = std::abs(current_azimuth_deg - target_az_deg);
        if (az_diff > 180.0) az_diff = 360.0 - az_diff; // Handle 360 to 0 wraparound

        for (int i = 0; i < CELLS_PER_SPOKE; i++) {
            uint8_t amplitude = rf_noise(gen); // Base RF Clutter

            // If the radar beam is sweeping over the target (+/- 1.5 degrees beam width)
            if (az_diff <= 1.5) {
                // If the current range cell is touching the target (+/- 2 cells length)
                if (std::abs(i - target_range) <= 2.0) {
                    amplitude = 250; 
                }
            }

            packet.push_back(amplitude);
        }

        packet.push_back((asterix_time >> 16) & 0xFF);
        packet.push_back((asterix_time >> 8) & 0xFF);
        packet.push_back(asterix_time & 0xFF);

        uint16_t total_length = packet.size();
        packet[1] = (total_length >> 8) & 0xFF;
        packet[2] = total_length & 0xFF;

        // --- E. TRANSMIT ---
        sendto(sock, packet.data(), packet.size(), 0, (struct sockaddr*)&target_addr, sizeof(target_addr));

        // Output throttled to once per second (at true North) to save your terminal
        print_hex(packet);
        
        std::this_thread::sleep_for(std::chrono::microseconds(1000000 / AZIMUTH_SPOKES));
    }

    close(sock);
    return 0;
}
