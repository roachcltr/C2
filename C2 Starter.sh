#!/bin/bash

# ==========================================
# C2 BACKEND MULTIPLEXER LAUNCHER
# ==========================================

CYAN='\033[0;36m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

echo -e "${CYAN}[*] Initializing C2 Backend Multiplexer...${NC}"

# 1. Ensure Tmux is installed
if ! command -v tmux &> /dev/null; then
    echo -e "${CYAN}[*] Installing tmux...${NC}"
    sudo apt install tmux -y
fi

SESSION_NAME="Backend"

# 2. Kill the session if it's already running in the background
tmux kill-session -t $SESSION_NAME 2>/dev/null

echo -e "${GREEN}[ DONE ] Launching grid...${NC}"
sleep 1

# 3. Create the session and launch the Web Server in Pane 0
tmux new-session -d -s $SESSION_NAME "echo '=== WEB DASHBOARD ==='; python3 -m http.server 8000 --directory $HOME/C2/Website/"

# 4. Split horizontally and launch the Tracker in Pane 1
tmux split-window -h "echo '=== TRACKER NODE ==='; $HOME/C2/Server/Tracker/TrackerNode"

# 5. Split vertically and launch Kamikaze TMMR in Pane 2
tmux split-window -v "echo '=== KAMIKAZE TMMR ==='; $HOME/C2/TMMR/kamikaze"

# 6. Select the first pane again, split it vertically for Video Node
tmux select-pane -t 0
#tmux split-window -v "echo '=== OPTRONIC VIDEO ==='; python3 $HOME/C2/Server/Optronic/video.py"

# 7. Split the Video pane vertically for the Control Node
tmux split-window -v "echo '=== OPTRONIC CONTROL ==='; python3 $HOME/C2/Server/Optronic/control.py"

# 8. Force all panels into an even, balanced grid layout
tmux select-layout -t $SESSION_NAME tiled

# 9. Enable mouse support so you can click between panels and scroll
tmux set-option -g mouse on

# 10. Attach your current terminal to the multiplexer grid
tmux attach-session -t $SESSION_NAME
