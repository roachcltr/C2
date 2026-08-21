// js/DataLink.js
const serverIP = window.location.hostname; 
const TRACKER_WS_URL = `ws://${serverIP}:9001`;
const VIDEO_WS_URL = `ws://${serverIP}:9002`;
// const KRAKEN_STREAM_URL = `https://msi-2.tailc0e307.ts.net/api/stream`;

// 1. KONEKSI TRACKER (C++)
export function connectTracker(onTrackReceived) {
  const trackerSocket = new WebSocket(TRACKER_WS_URL);

  trackerSocket.onopen = () => console.log("[Data Link] Tracker Stream ONLINE");
  
  trackerSocket.onmessage = (event) => {
    try {
      const trackData = JSON.parse(event.data);
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

// 2. KONEKSI VIDEO / SWEEP RADAR
export function connectVideo(onSweepReceived) {
  const videoSocket = new WebSocket(VIDEO_WS_URL);
  videoSocket.binaryType = "arraybuffer";

  videoSocket.onopen = () => console.log("[Data Link] Video Stream ONLINE");

  videoSocket.onmessage = (event) => {
    if (event.data.byteLength !== 258) return;
    const dataView = new DataView(event.data);
    const azimuthIndex = dataView.getUint16(0, false); 
    const amplitudes = new Uint8Array(event.data, 2);

    if (onSweepReceived) {
        onSweepReceived(azimuthIndex, amplitudes);
    }
  };

  videoSocket.onclose = () => {
    console.warn("[Data Link] Video Stream LOST. Reconnecting in 2s...");
    setTimeout(() => connectVideo(onSweepReceived), 2000);
  };
}

// // 3. KONEKSI KRAKEN SDR (Server-Sent Events)
// export function connectKraken(onKrakenReceived) {
//   const krakenSource = new EventSource(KRAKEN_STREAM_URL);

//   krakenSource.onopen = () => console.log("[Data Link] Kraken DOA Stream ONLINE");

//   krakenSource.onmessage = (event) => {
//     try {
//       const krakenData = JSON.parse(event.data);
      
//       // Log visual ke F12
//       const status = krakenData.status;
//       const angle = krakenData.doa_result?.angle_degrees;
//       const confidence = krakenData.doa_result?.confidence_score;
//       console.log(`[Kraken] Status: ${status} | Sudut: ${angle}° | Akurasi: ${confidence}`);

//       if (onKrakenReceived) {
//         onKrakenReceived(krakenData);
//       }
//     } catch (err) {
//       console.error("[Kraken] JSON Parsing Error:", err);
//     }
//   };

//   krakenSource.onerror = (err) => {
//     console.warn("[Data Link] Kraken Stream Error/Lost. Browser is auto-reconnecting...");
//   };
// }

// // 4. KONEKSI DISPATCH KE OPTRONIC C2 (Webhook Poller)
// export function listenForOptronicDispatch(onDispatchReceived) {
//   const DISPATCH_URL = `http://${serverIP}:9003/api/target`; 
//   let lastProcessedTimestamp = null;
  
//   // LOG AWAL: Memastikan fungsi ini benar-benar terpanggil saat web dibuka
//   console.log(`[Data Link] Memulai pantauan Dispatch Taktis di: ${DISPATCH_URL}`);
  
//   setInterval(async () => {
//     try {
//       // TAMBAHAN PENTING: cache: 'no-store' mencegah browser memberikan data kadaluarsa
//       const res = await fetch(DISPATCH_URL, { cache: 'no-store' });
      
//       if (res.ok) {
//         const data = await res.json();
        
//         // Memastikan perintah ini adalah perintah baru
//         if (data.timestamp && data.timestamp !== lastProcessedTimestamp) {
//           lastProcessedTimestamp = data.timestamp;
          
//           console.log("=======================================");
//           console.log("[TACTICAL DISPATCH RECEIVED FROM RDF]");
//           console.log(`- Frequency : ${data.freq} MHz`);
//           console.log(`- Target Bearing : ${data.bearing}°`);
//           console.log(`- Order Type: ${data.order_type}`);
//           console.log("=======================================");
          
//           if (onDispatchReceived) {
//             onDispatchReceived(data);
//           }
//         }
//       }
//     } catch (err) {
//       // Kita log tipis-tipis jika Python server mati agar mudah didiagnosis
//       // console.warn("[Data Link] Menunggu server Optronic Port 9003...");
//     }
//   }, 1000); 
// }