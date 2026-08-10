#include <iostream>
#include <vector>
#include <cmath>
#include <iomanip>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <unistd.h>
#include <thread>
#include <cstring>

// uWebSockets
#include <uWebSockets/App.h>

std::vector<std::vector<uint8_t>> master_radar_image(360, std::vector<uint8_t>(256, 0));
struct PerSocketData {};

// Passing the uWS::App by reference to defer publishing
void process_cat240_packet(const std::vector<uint8_t>& packet, uWS::App& app, uWS::Loop* loop) {
    if (packet.size() < 3 || packet[0] != 240) return;

    size_t offset = 3;
    std::vector<uint8_t> fspec;
    while (offset < packet.size()) {
        uint8_t current_fspec = packet[offset++];
        fspec.push_back(current_fspec);
        if (!(current_fspec & 0x01)) break;
    }

    int frn = 1;
    double start_az_deg = 0.0;
    int cell_count = 0;

    for (size_t i = 0; i < fspec.size(); ++i) {
        uint8_t current_fspec = fspec[i];
        for (int bit = 7; bit >= 1; --bit) {
            if (current_fspec & (1 << bit)) {
                if (offset >= packet.size()) return; 
                
                switch (frn) {
                    case 1: offset += 2; break;
                    case 2: offset += 1; break;
                    case 3: 
                        {
                            uint16_t start_az_raw = (packet[offset] << 8) | packet[offset+1];
                            start_az_deg = start_az_raw * (360.0 / 65536.0);
                            offset += 4;
                        } break;
                    case 4: case 5: case 6: break;
                    case 7: offset += 2; break;
                    case 8: 
                        {
                            cell_count = (packet[offset+3] << 8) | packet[offset+4];
                            offset += 5;
                        } break;
                    case 9: case 10: break;
                    case 11: 
                        {
                            int az_index = static_cast<int>(std::round(start_az_deg)) % 360;
                            
                            for (int c = 0; c < cell_count && c < 256; ++c) {
                                if (offset < packet.size()) {
                                    master_radar_image[az_index][c] = packet[offset++];
                                }
                            }
                            
                            // Construct the 258-byte payload
                            std::string binary_payload;
                            binary_payload.reserve(258);
                            binary_payload.push_back((az_index >> 8) & 0xFF);
                            binary_payload.push_back(az_index & 0xFF);
                            for (int c = 0; c < 256; ++c) {
                                binary_payload.push_back(master_radar_image[az_index][c]);
                            }

                            // 2. Use the loop pointer directly!
                            loop->defer([&app, binary_payload]() {
                                app.publish("video_stream", binary_payload, uWS::OpCode::BINARY, false);
                            });

                            std::cout << "Payload in hex: ";
                            for (const auto& byte : binary_payload) {
                                std::cout << std::hex << std::setw(2) << std::setfill('0') << (int)byte << " ";
                            }
                            std::cout << "\n";
                        } break;
                    case 12: offset += 3; break;
                    default: return;
                }
            }
            frn++;
        }
    }
}

int main() {
    const int RADAR_VIDEO_PORT = 12347; 
    const int WS_PORT = 9002;

    uWS::App app;

    // --- 1. SETUP WEBSOCKET ROUTE ---
    app.ws<PerSocketData>("/*", {
        .open = [](auto *ws) {
            ws->subscribe("video_stream");
            std::cout << "[+] New UI connected to VideoNode.\n";
        },
        .close = [](auto *ws, int /*code*/, std::string_view /*message*/) {
            std::cout << "[-] UI disconnected from VideoNode.\n";
        }
    });

    // --- 2. SETUP RADAR INGEST (Background Thread) ---
    auto *loop = uWS::Loop::get();
    std::thread udp_thread([&app, loop, RADAR_VIDEO_PORT]() {
        int recv_sock = socket(AF_INET, SOCK_DGRAM, 0);
        sockaddr_in server_addr{};
        server_addr.sin_family = AF_INET;
        server_addr.sin_addr.s_addr = INADDR_ANY; 
        server_addr.sin_port = htons(RADAR_VIDEO_PORT);

        if (bind(recv_sock, (struct sockaddr*)&server_addr, sizeof(server_addr)) < 0) {
            std::cerr << "[!] Failed to bind Radar Port " << RADAR_VIDEO_PORT << "\n";
            return;
        }

        uint8_t buffer[65536]; 
        sockaddr_in client_addr{};
        socklen_t client_len = sizeof(client_addr);

        while (true) {
            int bytes_received = recvfrom(recv_sock, buffer, sizeof(buffer), 0, (struct sockaddr*)&client_addr, &client_len);
            if (bytes_received > 0) {
                std::vector<uint8_t> packet(buffer, buffer + bytes_received);
                // 5. Pass the loop into the processor
                process_cat240_packet(packet, app, loop);
            }
        }
        close(recv_sock);
    });

    // --- 3. START WEBSOCKET EVENT LOOP (Main Thread) ---
    app.listen(WS_PORT, [WS_PORT](auto *listen_socket) {
        if (listen_socket) {
            std::cout << "[*] VideoNode WS Server Online on port " << WS_PORT << "...\n";
        } else {
            std::cerr << "[!] VideoNode Failed to listen on port " << WS_PORT << "\n";
        }
    }).run();

    udp_thread.join();
    return 0;
}