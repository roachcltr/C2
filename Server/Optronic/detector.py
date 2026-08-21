import cv2
import numpy as np
import json
import time
import websocket  # NEW: Import the websocket library

RTSP_URL = "rtsp://127.0.0.1:8554/live/viewpro"
WS_BACKEND_URL = "ws://127.0.0.1:9003/control"  # Where your Python script sends the data

def start_live_vl_tracking():
    cap = cv2.VideoCapture(RTSP_URL)
    
    if not cap.isOpened():
        print("Error: Could not connect to MediaMTX.")
        return

    # --- NEW: WebSocket Connection Manager ---
    ws = websocket.WebSocket()
    def connect_ws():
        try:
            ws.connect(WS_BACKEND_URL)
            print(f"Successfully connected to C2 Backend at {WS_BACKEND_URL}")
            return True
        except Exception:
            return False

    ws_connected = connect_ws()

    skip_frames = 5 
    frame_count = 0
    print("VL Corner Tracking Sidecar Started. Waiting for targets...")

    while True:
        ret, frame = cap.read()
        if not ret:
            print("Stream dropped. Reconnecting...")
            time.sleep(1)
            cap = cv2.VideoCapture(RTSP_URL)
            continue
            
        frame_count += 1
        if frame_count % skip_frames != 0:
            continue

        frame_height, frame_width = frame.shape[:2]

        # 1. Color Filtering (Strict #b76163)
        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        lower_red1 = np.array([0, 90, 120])
        upper_red1 = np.array([10, 255, 255])
        lower_red2 = np.array([170, 90, 120])
        upper_red2 = np.array([180, 255, 255])

        mask1 = cv2.inRange(hsv, lower_red1, upper_red1)
        mask2 = cv2.inRange(hsv, lower_red2, upper_red2)
        red_mask = cv2.bitwise_or(mask1, mask2)

        # 2. Light Morphological Closing
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
        red_mask = cv2.morphologyEx(red_mask, cv2.MORPH_CLOSE, kernel)

        contours, _ = cv2.findContours(red_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        valid_corners = []

        # 3. Find all 90-degree vertices
        for cnt in contours:
            perimeter = cv2.arcLength(cnt, True)
            epsilon = 0.04 * perimeter
            approx = cv2.approxPolyDP(cnt, epsilon, True)
            
            if len(approx) >= 3:
                for i in range(len(approx)):
                    ptA = approx[i][0]
                    ptB = approx[(i + 1) % len(approx)][0]
                    ptC = approx[(i + 2) % len(approx)][0]
                    
                    vec1 = np.array([ptA[0] - ptB[0], ptA[1] - ptB[1]])
                    vec2 = np.array([ptC[0] - ptB[0], ptC[1] - ptB[1]])
                    
                    mag1 = np.linalg.norm(vec1)
                    mag2 = np.linalg.norm(vec2)
                    
                    if mag1 < 10 or mag2 < 10:
                        continue
                        
                    cosine_angle = np.dot(vec1, vec2) / (mag1 * mag2)
                    cosine_angle = np.clip(cosine_angle, -1.0, 1.0)
                    angle = np.degrees(np.arccos(cosine_angle))
                    
                    if 80 < angle < 100:
                        valid_corners.append(ptB)

        # 4. Group the corners by proximity
        clusters = []
        for pt in valid_corners:
            added = False
            for cluster in clusters:
                if np.hypot(pt[0] - cluster[0][0], pt[1] - cluster[0][1]) < 200:
                    cluster.append(pt)
                    added = True
                    break
            if not added:
                clusters.append([pt])

        detected_targets = []
        target_id = 1

        # 5. Evaluate the groups
        for cluster in clusters:
            if len(cluster) >= 4:
                cx = int(float(np.mean([pt[0] for pt in cluster])))
                cy = int(float(np.mean([pt[1] for pt in cluster])))
                
                xs = [pt[0] for pt in cluster]
                ys = [pt[1] for pt in cluster]
                w = int(max(xs) - min(xs) + 40)
                h = int(max(ys) - min(ys) + 40)
                
                x_pct = cx / frame_width
                y_pct = cy / frame_height
                
                dx = int(round((x_pct * 1920) - 960))
                dy = int(-round((y_pct * 1080) - 540))

                detected_targets.append({
                    "id": f"AI_TARGET_{target_id}",
                    "ui_x": cx,
                    "ui_y": cy,
                    "gimbal_dx": dx,
                    "gimbal_dy": dy,
                    "width": w,
                    "height": h
                })
                target_id += 1

        # 6. --- NEW: Broadcast via WebSocket ---
        if detected_targets:
            payload = json.dumps({
                "type": "AVAILABLE_TARGETS", 
                "count": len(detected_targets),
                "targets": detected_targets
            })
            
            if ws_connected:
                try:
                    ws.send(payload)
                    print(f"Sent {len(detected_targets)} target(s) to C2 Backend.")
                except Exception:
                    print("Lost connection to C2 Backend. Targets not sent.")
                    ws_connected = False
            else:
                # Silently attempt to reconnect in the background
                ws_connected = connect_ws()

if __name__ == "__main__":
    print("Waiting 5 secs for MediaMTX")
    time.sleep(5)
    start_live_vl_tracking()
