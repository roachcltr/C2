# Radar Tracking & Threat Analysis Pipeline

This document outlines the official architecture, file layout, and data workflow for the radar tracking and threat analysis system. 

---

## System Architecture and File Layout

The codebase is organized sequentially to reflect the flow of data through the processing pipeline. 

| File Name | System Stage | Primary Responsibility |
| :--- | :--- | :--- |
| **`01_RadarPacketDecoder.h/.cpp`** | Stage 1: Decoding | Parses raw UDP byte streams into structured data. It is the only component that directly interfaces with the ASTERIX Category 048 wire format. |
| **`02_RadarTrack.h`** | Stage 2: Data Structure | Defines the `RadarTrack` object used to represent a single radar detection. It contains both raw radar fields and computed tactical fields, alongside the `toJson()` serialization logic. |
| **`03_ThreatAnalyzer.h/.cpp`** | Stage 3: Analysis | Operates as a stateful engine that maintains track history across memory. It calculates coordinates, evaluates kinematics, predicts trajectories, and assigns threat scores. |
| **`04_ServerMain.cpp`** | Stage 4: Network I/O | Serves as the system entry point (`main()`). It manages a background thread for UDP packet ingestion and a main thread for WebSocket broadcasting to user interfaces. |

---

## End-to-End Data Workflow

The system processes radar detections through a strict four-step pipeline:

### 1. Ingestion and Decoding
* A background thread listens on a designated UDP port for incoming radar payloads.
* Upon receiving a payload, the raw bytes are passed to the `decodeRadarPacket()` function.
* This function safely parses the ASTERIX format, applies bounds checking, and populates a baseline `RadarTrack` structure with raw kinematic and header data. 

### 2. Tactical Analysis
* The decoded `RadarTrack` is immediately handed off to `ThreatAnalyzer::processRecord()`. 
* The analyzer calculates the target's absolute latitude and longitude based on the anchor position.
* It evaluates the kinematic profile (e.g., speed and altitude) to classify the platform type (such as UAV, commercial airliner, or tactical fighter).
* Using historical data stored in the system's memory, it calculates a forward-looking prediction line.
* Finally, it assigns a 0-100 threat score based on classification, evasive behavior, and proximity to the anchor.

### 3. JSON Serialization
* Once the `RadarTrack` is enriched with tactical intelligence, the `toJson()` method is invoked.
* This method dynamically builds a JSON payload, strictly separating the original `raw_asterix` telemetry from the computed `tactical_data`. 

### 4. Client Broadcasting
* The finalized JSON string is dispatched back to the main thread.
* The `uWebSockets` server publishes this payload to all connected UI clients in real-time.

---

## Protocol Reference: ASTERIX Category 048

The ingestion stage of this system is built to strictly adhere to the EUROCONTROL ASTERIX Category 048 standard. 

* **Standardized Formatting:** ASTERIX is a recognized aviation-industry wire format utilized for transmitting radar plot and track data.
* **Field Reference Numbers (FRN):** Variables and comments referencing specific FRNs (such as `I048/040` for Measured Position or `I048/070` for Mode 3/A) refer to the official data item fields dictated by the specification. 
* **Data Integrity:** The pipeline utilizes dynamic FSPEC reading and extension bit chains to dynamically isolate these fields while protecting against truncated or malformed packets.
