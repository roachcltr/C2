import socket
import math
import json
import curses

# =========================================================
# OPTRONIC HARDWARE CONTROLLER (Unchanged)
# =========================================================
class OptronicController:
    def __init__(self, ip="192.168.2.160", port=10000):
        self.ip = ip
        self.port = port
        self.current_mode = "MANUAL"
        self.tracked_target_id = -1
        
        # Initialize UDP Socket[cite: 4]
        self.udp_socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.last_log = f"UDP Controller initialized -> {self.ip}:{self.port}"

    def log(self, message):
        """Helper to store the last log message for the UI instead of standard print"""
        self.last_log = message

    def build_frame(self, cmd_code, p0, p1, p2, p3):
        """Helper to build the 11-byte frame exactly like the C++ version[cite: 4]"""
        frame = bytearray(11)
        frame[0], frame[1], frame[2], frame[3] = 0xFB, 0x2C, 0xAA, 0x06
        frame[4], frame[5] = cmd_code, 0x00
        frame[6], frame[7], frame[8], frame[9] = p0, p1, p2, p3

        xor_checksum = 0
        for i in range(3, 10):
            xor_checksum ^= frame[i]
        frame[10] = xor_checksum

        return frame

    def send_to_hardware(self, frame):
        """Send the UDP packet[cite: 4]"""
        self.udp_socket.sendto(frame, (self.ip, self.port))
        hex_str = " ".join([f"{b:02X}" for b in frame])
        self.log(f"Sent Frame: {hex_str}")

    def process_command(self, action):
        """Translates string commands into hardware actions[cite: 4]"""
        action = action.strip()
        frame = None

        # --- TEMPORARY: OSD Language Test ---
        if action == "OSD_LANG_0": frame = self.build_frame(0x37, 0x04, 0x00, 0x00, 0x00)
        elif action == "OSD_LANG_1": frame = self.build_frame(0x37, 0x04, 0x01, 0x00, 0x00)
        elif action == "OSD_LANG_2": frame = self.build_frame(0x37, 0x04, 0x02, 0x00, 0x00)
        elif action == "OSD_LANG_3": frame = self.build_frame(0x37, 0x04, 0x03, 0x00, 0x00)
        elif action == "OSD_LANG_4": frame = self.build_frame(0x37, 0x04, 0x04, 0x00, 0x00)
        elif action == "OSD_LANG_5": frame = self.build_frame(0x37, 0x04, 0x05, 0x00, 0x00)
        elif action == "OSD_LANG_6": frame = self.build_frame(0x37, 0x04, 0x06, 0x00, 0x00)
        elif action == "OSD_LANG_7": frame = self.build_frame(0x37, 0x04, 0x07, 0x00, 0x00)
        elif action == "OSD_LANG_8": frame = self.build_frame(0x37, 0x04, 0x08, 0x00, 0x00)
        elif action == "OSD_LANG_9": frame = self.build_frame(0x37, 0x04, 0x09, 0x00, 0x00)

        # --- 1. SENSOR MODE[cite: 4] ---
        elif action in ("IR", "INFRARED"): frame = self.build_frame(0x25, 0x00, 0, 0, 0)
        elif action in ("DAYLIGHT", "DAY", "VL"): frame = self.build_frame(0x25, 0x01, 0, 0, 0)
        
        # --- 2. POINTING & GIMBAL MOTION[cite: 4] ---
        elif action == "LEFT":  frame = self.build_frame(0x70, 0xF6, 0xFF, 0x00, 0x00)
        elif action == "RIGHT": frame = self.build_frame(0x70, 0x0A, 0x00, 0x00, 0x00)
        elif action == "UP":    frame = self.build_frame(0x70, 0x00, 0x00, 0x0A, 0x00)
        elif action == "DOWN":  frame = self.build_frame(0x70, 0x00, 0x00, 0xF6, 0xFF)
        elif action == "STOP":  frame = self.build_frame(0x70, 0x00, 0x00, 0x00, 0x00)
        
        # --- 3. SPECIAL POINTING[cite: 4] ---
        elif action == "CENTER": frame = self.build_frame(0x71, 0, 0, 0, 0)
        
        # --- 4. ZOOM CONTROL[cite: 4] ---
        elif action == "VL_ZOOM_IN":   frame = self.build_frame(0x45, 0x01, 0x04, 0x00, 0x00)
        elif action == "VL_ZOOM_OUT":  frame = self.build_frame(0x45, 0x02, 0x04, 0x00, 0x00)
        elif action == "VL_ZOOM_STOP": frame = self.build_frame(0x45, 0x00, 0x00, 0x00, 0x00)
        
        # --- 5. LASER RANGE FINDER[cite: 4] ---
        elif action == "LASER_SINGLE": frame = self.build_frame(0x3D, 0x00, 0x00, 0x00, 0x00)

        if frame:
            self.send_to_hardware(frame)
        else:
            self.log(f"Ignored/Unknown Command: {action}")

# =========================================================
# INTERACTIVE TERMINAL UI
# =========================================================
def main(stdscr):
    # Setup curses environment
    curses.curs_set(0)  # Hide cursor
    stdscr.nodelay(True) # Make getch() non-blocking
    
    optronic = OptronicController()
    
    # Key mapping dictionary
    key_bindings = {
        curses.KEY_UP: "UP",
        curses.KEY_DOWN: "DOWN",
        curses.KEY_LEFT: "LEFT",
        curses.KEY_RIGHT: "RIGHT",
        ord(' '): "STOP",
        ord('c'): "CENTER",
        ord('z'): "VL_ZOOM_IN",
        ord('x'): "VL_ZOOM_OUT",
        ord('s'): "VL_ZOOM_STOP",
        ord('v'): "DAYLIGHT",
        ord('i'): "IR",
        ord('l'): "LASER_SINGLE",
        ord('0'): "OSD_LANG_0",
        ord('1'): "OSD_LANG_1",
        ord('2'): "OSD_LANG_2",
        ord('3'): "OSD_LANG_3",
        ord('4'): "OSD_LANG_4",
        ord('5'): "OSD_LANG_5",
        ord('6'): "OSD_LANG_6",
        ord('7'): "OSD_LANG_7",
        ord('8'): "OSD_LANG_8",
        ord('9'): "OSD_LANG_9",
    }

    last_cmd = "NONE"

    while True:
        stdscr.clear()

        # Draw UI — dibungkus try/except supaya tidak crash kalau
        # ukuran terminal terlalu kecil untuk menampung semua baris.
        try:
            stdscr.addstr(0, 0, "=== OPTRONIC HARDWARE TESTER ===", curses.A_BOLD)
            stdscr.addstr(2, 0, "Controls:")
            stdscr.addstr(3, 2, "[ARROWS] Pan & Tilt")
            stdscr.addstr(4, 2, "[SPACE]  Stop Movement")
            stdscr.addstr(5, 2, "[C]      Return to Center")
            stdscr.addstr(6, 2, "[Z / X]  Zoom In / Zoom Out")
            stdscr.addstr(7, 2, "[S]      Stop Zoom")
            stdscr.addstr(8, 2, "[V / I]  Daylight (VL) / Infrared (IR) Mode")
            stdscr.addstr(9, 2, "[L]      Fire Laser Single")
            stdscr.addstr(10, 2, "[0-9]    Test OSD Language/Colour")
            stdscr.addstr(11, 2, "[Q]      Quit")

            stdscr.addstr(13, 0, f"Last Triggered Action: {last_cmd}", curses.A_REVERSE)
            stdscr.addstr(15, 0, "Hardware Log:")
            stdscr.addstr(16, 0, f"> {optronic.last_log}")
        except curses.error:
            pass  # Terminal terlalu kecil untuk render semua baris — abaikan, jangan crash

        stdscr.refresh()

        # Input Polling Loop
        key = stdscr.getch()
        
        if key == ord('q'):
            break
            
        if key in key_bindings:
            cmd = key_bindings[key]
            last_cmd = cmd
            optronic.process_command(cmd)            
        curses.napms(30) # Prevent CPU hogging

if __name__ == "__main__":
    try:
        # Wrapper safely initializes and tears down the terminal interface
        curses.wrapper(main)
    except KeyboardInterrupt:
        pass