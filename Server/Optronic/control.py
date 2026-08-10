import asyncio
import websockets
import socket
import math
import json

# =========================================================
# OPTRONIC HARDWARE CONTROLLER
# =========================================================
class OptronicController:
    def __init__(self, ip="192.168.2.160", port=10000):
        self.ip = ip
        self.port = port
        self.current_mode = "MANUAL"
        self.tracked_target_id = -1
        
        # Initialize UDP Socket
        self.udp_socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        print(f"[OPTRONIC] UDP Controller initialized -> {self.ip}:{self.port}")

    def build_frame(self, cmd_code, p0, p1, p2, p3):
        """Helper to build the 11-byte frame exactly like the C++ version"""
        frame = bytearray(11)
        
        # Header & Length
        frame[0] = 0xFB
        frame[1] = 0x2C
        frame[2] = 0xAA
        frame[3] = 0x06
        
        # Command Code & Padding
        frame[4] = cmd_code
        frame[5] = 0x00
        
        # Parameters
        frame[6] = p0
        frame[7] = p1
        frame[8] = p2
        frame[9] = p3

        # XOR Checksum from frame[3] to frame[9]
        xor_checksum = 0
        for i in range(3, 10):
            xor_checksum ^= frame[i]
        frame[10] = xor_checksum

        return frame

    def send_to_hardware(self, frame):
        """Send the UDP packet and print the hex values"""
        self.udp_socket.sendto(frame, (self.ip, self.port))
        
        hex_str = " ".join([f"{b:02X}" for b in frame])
        print(f"[OPTRONIC] Sent Frame: {hex_str}")

    def send_absolute_position(self, az_deg, pitch_deg):
        """Calculates and sends the 0x72 DIGITAL_GUIDANCE command"""
        # Keep azimuth in range [0, 360) first
        az_deg = az_deg % 360.0

        # Convert to [-180, 180] for INT16 firmware compatibility
        if az_deg > 180.0:
            az_deg -= 360.0

        # Convert angles to INT16 * 100
        az_val = int(round(az_deg * 100.0)) & 0xFFFF
        pitch_val = int(round(pitch_deg * 100.0)) & 0xFFFF

        p0 = az_val & 0xFF
        p1 = (az_val >> 8) & 0xFF
        p2 = pitch_val & 0xFF
        p3 = (pitch_val >> 8) & 0xFF

        print(f"[OPTRONIC] [ABS POS 0x72] Azimuth: {az_deg:.2f}° ({az_val}), Pitch: {pitch_deg:.2f}° ({pitch_val})")
        
        frame = self.build_frame(0x72, p0, p1, p2, p3)
        self.send_to_hardware(frame)

    def process_telemetry_json(self, json_str):
        """Safely parse the JSON telemetry using Python's native json module"""
        try:
            data = json.loads(json_str)
            
            # Extract track ID and verify it matches our target
            track_id = data.get("track_id")
            if track_id != self.tracked_target_id:
                return

            # Navigate JSON tree safely
            asterix = data.get("raw_asterix", {})
            position = asterix.get("position", {})
            altitude = asterix.get("altitude", {})

            az_deg = position.get("az_deg")
            range_m = position.get("range_m")
            alt_ft = altitude.get("alt_ft")

            if az_deg is None or range_m is None or alt_ft is None:
                return

            # Trigonometry
            alt_m = alt_ft * 0.3048
            pitch_rad = math.atan2(alt_m, range_m)
            pitch_deg = math.degrees(pitch_rad)

            self.send_absolute_position(az_deg, pitch_deg)
            
        except json.JSONDecodeError:
            print("[OPTRONIC] Error decoding JSON payload.")
        except Exception as e:
            print(f"[OPTRONIC] Telemetry processing error: {e}")

    def process_command(self, action):
        """Translates string commands into hardware actions"""
        action = action.strip()

        # Mode Switch: TRACK:<id>
        if action.startswith("TRACK:"):
            try:
                self.tracked_target_id = int(action.split(":")[1])
                self.current_mode = "TRACKING"
                print(f"[OPTRONIC] Mode switched to TRACKING target ID: {self.tracked_target_id}")
            except ValueError:
                print(f"[OPTRONIC] Invalid TRACK command payload: {action}")
            return

        # Mode Switch: STOP_TRACKING
        if action in ("STOP_TRACKING", "MANUAL_MODE"):
            self.current_mode = "MANUAL"
            self.tracked_target_id = -1
            print("[OPTRONIC] Mode switched to MANUAL")
            return

        # Direct Position Command: GOTO / TRACK_POS
        if action.startswith("GOTO:") or action.startswith("TRACK_POS:"):
            try:
                parts = action.split(":")[1].split(",")
                az = float(parts[0])
                pitch = float(parts[1])
                self.send_absolute_position(az, pitch)
            except (IndexError, ValueError):
                print(f"[OPTRONIC] Invalid GOTO/TRACK_POS string: {action}")
            return

        # --- NEW: Video Point Tracking ---
        if action.startswith("POINT_TRACK:"):
            try:
                parts = action.split(":")[1].split(",")
                dx = int(parts[0])
                dy = int(parts[1])

                # Convert to signed 16-bit integer using two's complement mask
                dx_val = dx & 0xFFFF
                dy_val = dy & 0xFFFF

                p0 = dx_val & 0xFF
                p1 = (dx_val >> 8) & 0xFF
                p2 = dy_val & 0xFF
                p3 = (dy_val >> 8) & 0xFF

                print(f"[OPTRONIC] [POINT TRACK 0x3A] dX: {dx}px, dY: {dy}px")
                frame = self.build_frame(0x3A, p0, p1, p2, p3)
                self.send_to_hardware(frame)
            except (IndexError, ValueError):
                print(f"[OPTRONIC] Invalid POINT_TRACK string: {action}")
            return
        
        # Handle JSON Telemetry Stream
        if action.startswith("{"):
            if self.current_mode == "TRACKING" and self.tracked_target_id != -1:
                self.process_telemetry_json(action)
            return

        # Manual override: Automatically exit tracking mode
        manual_triggers = {"UP", "DOWN", "LEFT", "RIGHT", "STOP"}
        if self.current_mode == "TRACKING" and action in manual_triggers:
            self.current_mode = "MANUAL"
            self.tracked_target_id = -1
            print("[OPTRONIC] Manual override detected! Switched back to MANUAL mode.")

        frame = None

        # --- 1. SENSOR MODE ---
        if action in ("IR", "INFRARED"): frame = self.build_frame(0x25, 0x00, 0, 0, 0)
        elif action in ("DAYLIGHT", "DAY", "VL"): frame = self.build_frame(0x25, 0x01, 0, 0, 0)
        elif action == "PIP_VL_MAIN": frame = self.build_frame(0x25, 0x03, 0, 0, 0)
        elif action == "PIP_IR_MAIN": frame = self.build_frame(0x25, 0x04, 0, 0, 0)
        
        # --- 2. POINTING & GIMBAL MOTION ---
        elif action == "LEFT":  frame = self.build_frame(0x70, 0xF6, 0xFF, 0x00, 0x00)
        elif action == "RIGHT": frame = self.build_frame(0x70, 0x0A, 0x00, 0x00, 0x00)
        elif action == "UP":    frame = self.build_frame(0x70, 0x00, 0x00, 0x0A, 0x00)
        elif action == "DOWN":  frame = self.build_frame(0x70, 0x00, 0x00, 0xF6, 0xFF)
        elif action == "STOP":  frame = self.build_frame(0x70, 0x00, 0x00, 0x00, 0x00)
        
        # --- 3. SPECIAL POINTING ---
        elif action in ("LOCK", "LOCK_AZIMUTH"): frame = self.build_frame(0x7A, 0, 0, 0, 0)
        elif action in ("CENTER", "RETURN_TO_CENTRE"): frame = self.build_frame(0x71, 0, 0, 0, 0)
        elif action == "PATROL": frame = self.build_frame(0x70, 0x01, 0x00, 0x00, 0x00)
        
        # --- 4. ZOOM CONTROL ---
        elif action == "VL_ZOOM_IN":   frame = self.build_frame(0x45, 0x01, 0x04, 0x00, 0x00)
        elif action == "VL_ZOOM_OUT":  frame = self.build_frame(0x45, 0x02, 0x04, 0x00, 0x00)
        elif action == "VL_ZOOM_STOP": frame = self.build_frame(0x45, 0x00, 0x00, 0x00, 0x00)
        elif action == "IR_ZOOM_IN":   frame = self.build_frame(0x50, 15, 0x00, 0x00, 0x00)
        elif action == "IR_ZOOM_OUT":  frame = self.build_frame(0x50, 16, 0x00, 0x00, 0x00)
        elif action == "IR_ZOOM_STOP": frame = self.build_frame(0x50, 0x00, 0x00, 0x00, 0x00)
        
        # --- 5. LASER RANGE FINDER ---
        elif action == "LASER_SINGLE": frame = self.build_frame(0x3D, 0x00, 0x00, 0x00, 0x00)
        elif action == "LASER_CONT":   frame = self.build_frame(0x3E, 0x01, 0x00, 0x00, 0x00)
        elif action == "LASER_STOP":   frame = self.build_frame(0x3F, 0x00, 0x00, 0x00, 0x00)
        
        # --- 6. VISIBLE LIGHT (VL) FOCUS ---
        elif action == "VL_FOCUS_IN":   frame = self.build_frame(0x45, 0x03, 0x00, 0x00, 0x00)
        elif action == "VL_FOCUS_OUT":  frame = self.build_frame(0x45, 0x04, 0x00, 0x00, 0x00)
        elif action == "VL_FOCUS_AUTO": frame = self.build_frame(0x45, 0x05, 0x00, 0x00, 0x00)
        elif action == "VL_FOCUS_STOP": frame = self.build_frame(0x45, 0x00, 0x00, 0x00, 0x00)
        
        # --- 7. INFRARED (IR) FOCUS ---
        elif action == "IR_FOCUS_IN":   frame = self.build_frame(0x50, 0x01, 0x00, 0x00, 0x00)
        elif action == "IR_FOCUS_OUT":  frame = self.build_frame(0x50, 0x02, 0x00, 0x00, 0x00)
        elif action == "IR_FOCUS_AUTO": frame = self.build_frame(0x50, 0x03, 0x00, 0x00, 0x00)
        elif action == "IR_FOCUS_STOP": frame = self.build_frame(0x50, 0x00, 0x00, 0x00, 0x00)
        
        # --- 8. OSD SETTINGS ---
        elif action == "OSD_FLIP":      frame = self.build_frame(0x37, 0x01, 0x00, 0x00, 0x00)

        # --- 9. VL ENHANCEMENTS (DEFOG & LOW LIGHT) ---
        elif action == "VL_DEFOG_ON":      frame = self.build_frame(0x4A, 0x01, 0x00, 0x00, 0x00)
        elif action == "VL_DEFOG_OFF":     frame = self.build_frame(0x4A, 0x00, 0x00, 0x00, 0x00)
        elif action == "VL_LOWLIGHT_ON":   frame = self.build_frame(0x4B, 0x01, 0x00, 0x00, 0x00)
        elif action == "VL_LOWLIGHT_OFF":  frame = self.build_frame(0x4B, 0x00, 0x00, 0x00, 0x00)

        # --- 10. IR ENHANCEMENTS (PALETTE & NUC) ---
        elif action == "IR_PALETTE":       frame = self.build_frame(0x53, 0x01, 0x00, 0x00, 0x00)
        elif action == "IR_NUC":           frame = self.build_frame(0x56, 0x00, 0x00, 0x00, 0x00)

        # --- 11. UNTRACKING ---
        elif action == "UNTRACK":       frame = self.build_frame(0x3B, 0x00, 0x00, 0x00, 0x00)
        
        # --- 12. GENERAL COMMANDS & MEDIA ---
        elif action == "SEQ_SWITCH":       frame = self.build_frame(0x31, 0x00, 0x00, 0x00, 0x00)
        elif action == "SCREENSHOT":       frame = self.build_frame(0x32, 0x00, 0x00, 0x00, 0x00)
        
        # Asumsi standar untuk toggle: Parameter 0x01 = Start/On, 0x00 = Stop/Off
        elif action == "RECORD_START":     frame = self.build_frame(0x33, 0x01, 0x00, 0x00, 0x00)
        elif action == "RECORD_STOP":      frame = self.build_frame(0x33, 0x00, 0x00, 0x00, 0x00)
        elif action == "CONT_CAP_START":   frame = self.build_frame(0x34, 0x01, 0x00, 0x00, 0x00)
        elif action == "CONT_CAP_STOP":    frame = self.build_frame(0x34, 0x00, 0x00, 0x00, 0x00)

        # --- 13. AI DETECTION (91H) ---
        elif action == "AI_ON":            frame = self.build_frame(0x91, 0x01, 0x00, 0x00, 0x00)
        elif action == "AI_OFF":           frame = self.build_frame(0x91, 0x00, 0x00, 0x00, 0x00)

        else:
            print(f"[OPTRONIC] Ignored Unknown Command: {action}")
            return

        if frame:
            self.send_to_hardware(frame)

# =========================================================
# WEBSOCKET SERVER
# =========================================================
optronic = OptronicController()

async def ws_handler(websocket):
    """Handles incoming WebSocket connections and routes messages"""
    # In newer websockets versions, path is an attribute of the request
    path = websocket.request.path
    
    # Emulate the '/control' routing
    if path == "/control":
        try:
            async for message in websocket:
                # To reduce console spam, we choose not to print raw JSON telemetry
                if not message.startswith("{"):
                    print(f"[WS] Received Message: {message}")
                
                optronic.process_command(message)
        except websockets.exceptions.ConnectionClosed:
            pass
    else:
        print(f"[WS] Connection rejected on unknown path: {path}")

async def main():
    port = 9003
    print(f"=== C2 SERVER RUNNING ON PORT {port} ===")
    
    # Start the async WebSocket server on all interfaces (0.0.0.0)
    async with websockets.serve(ws_handler, "0.0.0.0", port):
        await asyncio.Future()  # run forever

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[SERVER] Shutting down...")