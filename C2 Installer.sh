#!/bin/bash

# ==========================================
# C2 MASTER AUTOMATED SETUP SCRIPT
# ==========================================

# Color Variables
CYAN='\033[0;36m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color
BOLD='\033[1m'

LOG_FILE="/tmp/master_setup.log"
> "$LOG_FILE" # Clear previous log

clear
echo -e "${CYAN}${BOLD}"
cat << 'EOF'
   _________      ____             __                  __   __             ____                   __  
  / ____/__ \    / __ )____ ______/ /_____  ____  ____/ /  / /_  __  __   / __ \____  ____ ______/ /_ 
 / /    __/ /   / __  / __ `/ ___/ //_/ _ \/ __ \/ __  /  / __ \/ / / /  / /_/ / __ \/ __ `/ ___/ __ \
/ /___ / __/   / /_/ / /_/ / /__/ ,< /  __/ / / / /_/ /  / /_/ / /_/ /  / _, _/ /_/ / /_/ / /__/ / / /
\____//____/  /_____/\__,_/\___/_/|_|\___/_/ /_/\__,_/  /_.___/\__, /  /_/ |_|\____/\__,_/\___/_/ /_/ 
                                                              /____/                                  
EOF
echo -e "${NC}${BOLD}      PT Len Industri's C2 Environment Initialization...${NC}\n"

# ==========================================
# PHASE 0: FILE TREE VERIFICATION
# ==========================================
echo -e "${YELLOW}[*] Verifying C2 File Structure in ~/C2...${NC}"
RADAR_DIR="$HOME/C2"

if [ ! -d "$RADAR_DIR" ]; then
    echo -e "${RED}[ FAILED ] Base directory ~/C2 does not exist!${NC}"
    exit 1
fi

# Array of all required files based on your tree
REQUIRED_FILES=(
    "Server/Optronic/control.py"
    "Server/Optronic/video.py"
    "Server/Tracker/01RadarPacketDecoder.cpp"
    "Server/Tracker/01RadarPacketDecoder.h"
    "Server/Tracker/02RadarTrack.h"
    "Server/Tracker/03ThreatAnalyzer.cpp"
    "Server/Tracker/03ThreatAnalyzer.h"
    "Server/Tracker/04ServerMain.cpp"
    "Server/Tracker/README.md"
    "Server/Video/VideoNode.cpp"
    "TMMR/CAT-048.cpp"
    "TMMR/CAT-240.cpp"
    "TMMR/Jet.cpp"
    "TMMR/kamikaze.cpp"
    "Website/css/00global.css"
    "Website/css/01buttons.css"
    "Website/css/02sidebarContainer.css"
    "Website/css/03sidebarTabs.css"
    "Website/css/04compass.css"
    "Website/css/05sidebarPanels.css"
    "Website/css/06sidebarSliders.css"
    "Website/css/07rings.css"
    "Website/css/08theme.css"
    "Website/css/09collapseChevron.css"
    "Website/css/10opacitySlider.css"
    "Website/css/11targets.css"
    "Website/css/12hardwareStatus.css"
    "Website/css/13legends.css"
    "Website/css/14sidebarScroll.css"
    "Website/css/15about.css"
    "Website/css/16cameraPanel.css"
    "Website/css/style.css"
    "Website/img/logo-len.png"
    "Website/index.html"
    "Website/js/app.js"
    "Website/js/core/Map.js"
    "Website/js/data/DataLink.js"
    "Website/js/data/TrackHandler.js"
    "Website/js/entities/trackGeometry.js"
    "Website/js/entities/trackLifecycle.js"
    "Website/js/entities/trackMain.js"
    "Website/js/entities/trackPrediction.js"
    "Website/js/entities/trackTrail.js"
    "Website/js/entities/trackVisuals.js"
    "Website/js/hardware/optronic.js"
    "Website/js/jsmpeg.min.js"
    "Website/js/ui/UI.js"
    "Website/js/ui/buttons/baseView.js"
    "Website/js/ui/buttons/compass.js"
    "Website/js/ui/buttons/fullscreenControl.js"
    "Website/js/ui/buttons/resetView.js"
    "Website/js/ui/buttons/theme.js"
    "Website/js/ui/overlays/VideoOverlay.js"
    "Website/js/ui/overlays/azimuthLines.js"
    "Website/js/ui/overlays/geoUtils.js"
    "Website/js/ui/overlays/latLonGrid.js"
    "Website/js/ui/overlays/mapAppearance.js"
    "Website/js/ui/overlays/overlaySync.js"
    "Website/js/ui/overlays/rangeRings.js"
    "Website/js/ui/panels/tabHardware.js"
    "Website/js/ui/panels/tabIndex.js"
    "Website/js/ui/panels/tabMap.js"
    "Website/js/ui/panels/tabSystemNetworking.js"
    "Website/js/ui/panels/tabTargets.js"
)

MISSING_COUNT=0
for file in "${REQUIRED_FILES[@]}"; do
    if [ ! -f "$RADAR_DIR/$file" ]; then
        echo -e "${RED}  -> Missing: $file${NC}"
        MISSING_COUNT=$((MISSING_COUNT+1))
    fi
done

if [ $MISSING_COUNT -gt 0 ]; then
    echo -e "\n${RED}[ WARNING ] $MISSING_COUNT file(s) are missing from the expected tree!${NC}"
    read -p "Do you want to continue with the setup anyway? (y/n): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}Setup aborted by user.${NC}"
        exit 1
    fi
    echo -e "${CYAN}Proceeding despite missing files...${NC}\n"
else
    echo -e "${GREEN}[ OK ] File tree verification passed perfectly!${NC}\n"
fi


# ==========================================
# EXECUTION WRAPPER
# ==========================================
execute_step() {
    local msg="$1"
    shift
    echo -e "${YELLOW}[*] ${msg}...${NC}"
    
    # Run command directly, duplicate output to both terminal and log
    "$@" 2>&1 | tee -a "$LOG_FILE"
    
    # Capture the exact exit status of the command (ignoring tee)
    local status=${PIPESTATUS[0]}
    
    if [ $status -eq 0 ]; then
        echo -e "${GREEN}[ DONE ]${NC}\n"
    else
        echo -e "${RED}[ FAILED ]${NC}"
        echo -e "${RED}Error detected! Check ${LOG_FILE} for details.${NC}"
        exit 1
    fi
}

# Request Sudo Upfront
echo -e "${CYAN}[*] Requesting Administrator Privileges...${NC}"
sudo apt update -y 2>&1 | tee -a "$LOG_FILE"
echo -e "${GREEN}[ DONE ] Sudo access granted.${NC}\n"

# ==========================================
# PHASE 1: FIREWALL & NETWORKING
# ==========================================
echo -e "${CYAN}${BOLD}--- Phase 1: Network & Firewall Configuration ---${NC}"
if ! command -v ufw &> /dev/null; then
    execute_step "Installing UFW" sudo apt install ufw -y
fi
execute_step "Resetting firewall rules to default" sudo ufw --force reset
execute_step "Safeguard: Allowing SSH (Port 22)" sudo ufw allow ssh
execute_step "Opening Port 8000 (HTTP Dashboard)" sudo ufw allow 8000/tcp
execute_step "Opening Port 8082 (MJPEG Video Stream)" sudo ufw allow 8082/tcp
execute_step "Opening Port 9001, 9002 (WebSocket)" sudo ufw allow 9001:9002/tcp
execute_step "Opening Port 9003 (WebSocket Optronic)" sudo ufw allow 9003/tcp
execute_step "Opening Port 10000 (UDP Hardware)" sudo ufw allow 10000/udp
execute_step "Opening Port 10003 (UDP Alternate)" sudo ufw allow 10003/udp
execute_step "Enabling the Firewall" sudo ufw --force enable
echo ""

# ==========================================
# PHASE 2: OPTRONIC PYTHON ENVIRONMENT
# ==========================================
echo -e "${CYAN}${BOLD}--- Phase 2: Python Optronic Environment ---${NC}"
if ! command -v python3 &> /dev/null; then
    execute_step "Installing Python3 core packages" sudo apt install python3 -y
fi
execute_step "Installing Python3 PIP" sudo apt install python3-pip -y
execute_step "Mapping 'python' command to Python3" sudo apt install python-is-python3 -y
execute_step "Installing websockets, opencv-python, flask (Global PEP 668 Override)" pip install websockets opencv-python flask --break-system-packages 
echo ""

# ==========================================
# PHASE 3: TRACKER C++ COMPILATION
# ==========================================
echo -e "${CYAN}${BOLD}--- Phase 3: Tracker Node Build ---${NC}"
echo -e "${YELLOW}[*] Navigating to Tracker Directory...${NC}"
cd "$RADAR_DIR/Server/Tracker" || exit 1
echo -e "${GREEN}[ DONE ]${NC}\n"

if [ -d "uWebSockets" ]; then
    rm -rf uWebSockets
fi

execute_step "Cloning uWebSockets repository" git clone --recursive https://github.com/uNetworking/uWebSockets.git "$RADAR_DIR/Server/Tracker/uWebSockets"

cd "$RADAR_DIR/Server/Tracker/uWebSockets/src" || exit 1
mv ./* ../ || exit 1

cd "$RADAR_DIR/Server/Tracker/uWebSockets/uSockets" || exit 1
execute_step "Compiling uSockets (C Library)" make
execute_step "Installing libuSockets.a to system paths" sudo cp uSockets.a /usr/local/lib/libuSockets.a
cd ../.. || exit 1

execute_step "Compiling TrackerNode Executable" g++ -O3 *.cpp -o TrackerNode -I. -I./uWebSockets/uSockets/src -luSockets -lz
echo ""

# ==========================================
# PHASE 4: TMMR SIMULATOR COMPILATION
# ==========================================
echo -e "${CYAN}${BOLD}--- Phase 4: TMMR Simulator Compilation ---${NC}"

# Navigate to the TMMR directory
echo -e "${YELLOW}[*] Navigating to TMMR Directory...${NC}"
cd ~/C2/TMMR || { echo -e "${RED}[ FAILED ] Directory not found!${NC}"; exit 1; }
echo -e "${GREEN}[ DONE ]${NC}\n"

# Compile all radar target simulators
execute_step "Compiling CAT-048 Simulator" g++ -O3 CAT-048.cpp -o CAT-048
execute_step "Compiling CAT-240 Simulator" g++ -O3 CAT-240.cpp -o CAT-240
execute_step "Compiling Jet Simulator" g++ -O3 Jet.cpp -o Jet
execute_step "Compiling Kamikaze Simulator" g++ -O3 kamikaze.cpp -o kamikaze

echo ""

# ==========================================
# COMPLETION
# ==========================================
echo ""
echo -e "${GREEN}${BOLD}====================================================${NC}"
echo -e "${GREEN}${BOLD}      C2 DEPLOYMENT SUCCESSFUL!                     ${NC}"
echo -e "${GREEN}${BOLD}====================================================${NC}"
echo -e "System is verified, networked, configured, and compiled."
echo -e "Check ${YELLOW}$LOG_FILE${NC} for full execution logs if needed."
echo ""
