import os
import threading
import time
import cv2
from flask import Flask, Response

# Paksa FFMPEG untuk zero-caching dan prioritaskan kecepatan di atas segalanya
os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = (
    "fflags;nobuffer|flags;low_delay|framedrop;1|max_delay;0"
)

app = Flask(__name__)
UDP_STREAM_URL = "udp://0.0.0.0:10004"


class UltraLowLatencyGrabber:

  def __init__(self, url):
    self.url = url
    self.cap = cv2.VideoCapture(self.url, cv2.CAP_FFMPEG)
    self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

    self.running = True
    self.latest_frame = None
    self.lock = threading.Lock()

    self.thread = threading.Thread(target=self._update, daemon=True)
    self.thread.start()

  def _update(self):
    print("[!] Thread Ultra-Low Latency aktif...")
    while self.running:
      # KUNCI RAHASIA: Gunakan grab() agar sangat cepat membuang antrean internal
      grabbed = self.cap.grab()
      if grabbed:
        # Hanya decode (retrieve) frame yang benar-benar berada di ujung antrean
        ret, frame = self.cap.retrieve()
        if ret:
          with self.lock:
            self.latest_frame = frame
      else:
        time.sleep(0.001)

  def get_frame(self):
    with self.lock:
      if self.latest_frame is not None:
        return self.latest_frame
      return None

  def stop(self):
    self.running = False
    self.cap.release()


grabber = UltraLowLatencyGrabber(UDP_STREAM_URL)


def generate_frames():
  # Parameter kompresi JPEG: Kualitas 70% membuat ukuran file 50% lebih kecil
  # sehingga transfer jaringan lokal ke browser terjadi seketika (sub-millisecond)
  encode_param = [
      int(cv2.IMWRITE_JPEG_QUALITY),
      70,
      int(cv2.IMWRITE_JPEG_OPTIMIZE),
      1,
  ]

  while True:
    frame = grabber.get_frame()
    if frame is None:
      time.sleep(0.005)
      continue

    ret, buffer = cv2.imencode(".jpg", frame, encode_param)
    frame_bytes = buffer.tobytes()

    yield (
        b"--frame\r\n"
        b"Content-Type: image/jpeg\r\n\r\n" + frame_bytes + b"\r\n"
    )
    # Hapus batas time.sleep(0.033) agar browser menerima secepat kemampuannya
    time.sleep(0.01)


@app.route("/kamera")
def video_feed():
  # Tambahkan header Cache-Control agar browser TIDAK PERNAH menimbun gambar di cache
  return Response(
      generate_frames(),
      mimetype="multipart/x-mixed-replace; boundary=frame",
      headers={
          "Cache-Control": (
              "no-store, no-cache, must-revalidate, pre-check=0, post-check=0,"
              " max-age=0"
          ),
          "Pragma": "no-cache",
          "Expires": "0",
      },
  )


if __name__ == "__main__":
  print("=== VIDEO BRIDGE ULTRA-LOW LATENCY AKTIF ===")
  app.run(host="0.0.0.0", port=8082, threaded=True)
