// js/DataLink.js
const serverIP = window.location.hostname; 
const TRACKER_WS_URL = `ws://${serverIP}:9001`;
const VIDEO_WS_URL = `ws://${serverIP}:9002`;

export function connectTracker(onTrackReceived) {
  const trackerSocket = new WebSocket(TRACKER_WS_URL);

  trackerSocket.onopen = () => console.log("[Data Link] Tracker Stream ONLINE");
  
  trackerSocket.onmessage = (event) => {
    try {
      const trackData = JSON.parse(event.data);
      
      // Instead of writing to the DOM here, we pass the data back to app.js
      if (onTrackReceived) {
        onTrackReceived(trackData);
      }
      
    } catch (err) {
      console.error("[Tracker] JSON Parsing Error:", err);
    }
  };

  trackerSocket.onclose = () => {
    console.warn("[Data Link] Tracker Stream LOST. Reconnecting in 2s...");
    setTimeout(() => connectTracker(onTrackReceived), 2000);
  };
}

export function connectVideo(onSweepReceived) {
  const videoSocket = new WebSocket(VIDEO_WS_URL);
  videoSocket.binaryType = "arraybuffer";

  videoSocket.onopen = () => console.log("[Data Link] Video Stream ONLINE");

  videoSocket.onmessage = (event) => {
    if (event.data.byteLength !== 258) return;
    const dataView = new DataView(event.data);
    const azimuthIndex = dataView.getUint16(0, false); 
    const amplitudes = new Uint8Array(event.data, 2);

    // Pass the parsed data back to the main app
    if (onSweepReceived) {
        onSweepReceived(azimuthIndex, amplitudes);
    }
  };

  videoSocket.onclose = () => {
    console.warn("[Data Link] Video Stream LOST. Reconnecting in 2s...");
    setTimeout(() => connectVideo(onSweepReceived), 2000);
  };
}