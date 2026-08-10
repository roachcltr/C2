#!/bin/bash

# ==========================================
# SYSTEM UPDATER & CRT KIOSK INITIALIZATION
# ==========================================

# Color Variables
CYAN='\033[0;36m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color
BOLD='\033[1m'

LOG_FILE="/tmp/system_update.log"
> "$LOG_FILE" # Clear previous log

# 1. Print Banner (Using Heredoc to protect formatting)
clear
echo -e "${CYAN}${BOLD}"
cat << 'EOF'
   _____            __                    __  __          __      __           
  / ___/__  _______/ /____  ____ ___     / / / /___  ____/ /___ _/ /____  _____
  \__ \/ / / / ___/ __/ _ \/ __ `__ \   / / / / __ \/ __  / __ `/ __/ _ \/ ___/
 ___/ / /_/ (__  ) /_/  __/ / / / / /  / /_/ / /_/ / /_/ / /_/ / /_/  __/ /    
/____/\__, /____/\__/\___/_/ /_/ /_/   \____/ .___/\__,_/\__,_/\__/\___/_/     
     /____/                                /_/                                 
EOF
echo -e "${NC}${BOLD}       System Update & Kiosk Setup Initiated...${NC}\n"

# 2. Execution Wrapper (Synchronous with real-time output)
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

# ==========================================
# WORKFLOW EXECUTION
# ==========================================

# Cache sudo credentials upfront
echo -e "${CYAN}[*] Requesting Administrator Privileges...${NC}"
sudo -v
echo -e "${GREEN}[ DONE ] Sudo access granted.${NC}\n"

# APT Updates & Installations
execute_step "Updating package lists" sudo apt update -y
execute_step "Upgrading system packages" sudo apt upgrade -y

# Git Installation
execute_step "Installing Git" sudo apt install git -y

echo ""
echo -e "${GREEN}${BOLD}==========================================${NC}"
echo -e "${GREEN}${BOLD}             SETUP COMPLETE!              ${NC}"
echo -e "${GREEN}${BOLD}==========================================${NC}"
echo ""
sleep 3
