// ============================================================================
// STAGE 4 OF THE PIPELINE (entry point): wire everything together
// ============================================================================
// (formerly "TrackerNode.cpp")
//
// This is the only file with a main(). It has two jobs running
// concurrently:
//   - A background thread listens for raw radar UDP packets, runs each one
//     through decodeRadarPacket() (stage 1) and then ThreatAnalyzer (stage
//     3), and gets back a fully-populated RadarTrack.
//   - The main thread runs a WebSocket server that any number of UI clients
//     can connect to; every decoded RadarTrack is serialized to JSON
//     (RadarTrack::toJson(), stage 2) and published out to them.
// ============================================================================

#include <iostream>
#include <vector>
#include <string>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <unistd.h>
#include <thread>

// uWebSockets
#include <uWebSockets/App.h>

// Custom modules (numbered in pipeline order - see each header for its role)
#include "01RadarPacketDecoder.h"
#include "02RadarTrack.h"
#include "03ThreatAnalyzer.h"

// Empty struct for uWS socket data (required by template)
struct PerSocketData {};

int main() {
    const int RADAR_PORT = 12345;
    const int WS_PORT = 9001;
    
    // Initialize uWebSockets App
    uWS::App app;

    // --- 1. SETUP WEBSOCKET ROUTE ---
    app.ws<PerSocketData>("/*", {
        .open = [](auto *ws) {
            // When a UI connects, subscribe them to the tracker stream
            ws->subscribe("tracker_stream");
            std::cout << "[+] New UI connected to TrackerNode.\n";
        },
        .close = [](auto *ws, int /*code*/, std::string_view /*message*/) {
            std::cout << "[-] UI disconnected from TrackerNode.\n";
        }
    });

    // --- 2. SETUP RADAR INGEST (Background Thread) ---
    auto *loop = uWS::Loop::get();
    std::thread udp_thread([&app, loop, RADAR_PORT]() {
        ThreatAnalyzer engine(-7.749786, 108.502177);
        int radar_sock = socket(AF_INET, SOCK_DGRAM, 0);
        if (radar_sock < 0) {
            std::cerr << "[!] Failed to create radar socket\n";
            return;
        }

        sockaddr_in server_addr{};
        server_addr.sin_family = AF_INET;
        server_addr.sin_addr.s_addr = htonl(INADDR_ANY); 
        server_addr.sin_port = htons(RADAR_PORT);

        if (bind(radar_sock, (struct sockaddr*)&server_addr, sizeof(server_addr)) < 0) {
            std::cerr << "[!] Failed to bind radar port " << RADAR_PORT << "\n";
            close(radar_sock);
            return;
        }

        uint8_t buffer[1024];
        sockaddr_in client_addr{};
        socklen_t client_len = sizeof(client_addr);

        while (true) {
            int bytes_received = recvfrom(radar_sock, buffer, sizeof(buffer), 0, (struct sockaddr*)&client_addr, &client_len);
            
            if (bytes_received > 0) {
                std::vector<uint8_t> packet(buffer, buffer + bytes_received);
                RadarTrack decoded_record = decodeRadarPacket(packet);
                engine.processRecord(decoded_record);
                std::string json_payload = decoded_record.toJson();
                
                // 3. Use the loop pointer directly!
                loop->defer([&app, json_payload]() {
                    app.publish("tracker_stream", json_payload, uWS::OpCode::TEXT, false);
                });
                std::cout << "[*] JSON Payload: " << json_payload << "\n";
            }
        }
        close(radar_sock);
    });

    // --- 3. START WEBSOCKET EVENT LOOP (Main Thread) ---
    app.listen(WS_PORT, [WS_PORT](auto *listen_socket) {
        if (listen_socket) {
            std::cout << "[*] TrackerNode WS Server Online on port " << WS_PORT << "...\n";
        } else {
            std::cerr << "[!] TrackerNode Failed to listen on port " << WS_PORT << "\n";
        }
    }).run();

    udp_thread.join();
    return 0;
}
