# ─────────────────────────────────────────────
#  Mr Nadhif – Main Pi Controller
#
#  Main loop    → Camera + YOLO + annotated stream
#  Sensor loop  → Arduino 1 serial (background thread)
#  Motor serial → Arduino 2 (servo commands)
#  POST calls   → Fire-and-forget daemon threads (never block main loop)
#  Stream       → http://<pi-ip>:8080
#
#  Ports:
#   /dev/ttyACM0 → Arduino 1 (sensors, read)
#   /dev/ttyACM1 → Arduino 2 (motors, write)
# ─────────────────────────────────────────────

import cv2
import requests
import time
import os
import tempfile
import serial
import threading
import logging
from datetime import datetime
from flask import Flask, Response
from picamera2 import Picamera2
from ultralytics import YOLO

# ── Backend config ────────────────────────────
BASE_URL = 'http://172.20.10.2:5000'
API_KEY  = 'test123'

# ── Supabase Storage config ───────────────────
SUPABASE_URL    = 'https://mtkzevhdxczjlcndtsgi.supabase.co'
SUPABASE_ANON   = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10a3pldmhkeGN6amxjbmR0c2dpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNjQ3MTEsImV4cCI6MjA4OTk0MDcxMX0.qmjdyi_XLUW-IghUWl8LOe1931hbbq63l83CTSQZ7Ro'
SUPABASE_BUCKET = 'valuables'

# ── YOLO config ───────────────────────────────
MODEL_PATH       = '/home/arlo/report/best.pt'
CONFIDENCE       = 0.25
IOU              = 0.45
CAPTURE_INTERVAL = 2    # seconds between YOLO runs
REFOCUS_INTERVAL = 20   # seconds between auto-refocus
YOLO_IMGSZ       = 320  # smaller = faster inference

# ── Stream config ─────────────────────────────
STREAM_PORT = 8080

# ─────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s'
)
log = logging.getLogger(__name__)

# ── Shared state ──────────────────────────────
current_lat  = None
current_lng  = None
motor_serial = None

last_detected      = {}
DETECTION_COOLDOWN = 10  # seconds

# ── MJPEG shared frame ────────────────────────
latest_frame      = None
latest_frame_lock = threading.Lock()

# ── Flask MJPEG server ────────────────────────
app = Flask(__name__)

def generate_frames():
    while True:
        with latest_frame_lock:
            frame = latest_frame
        if frame is None:
            time.sleep(0.01)
            continue
        ret, jpeg = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 75])
        if not ret:
            continue
        yield (
            b'--frame\r\n'
            b'Content-Type: image/jpeg\r\n\r\n' +
            jpeg.tobytes() +
            b'\r\n'
        )
        time.sleep(0.033)  # ~30 fps cap

@app.route('/')
def index():
    return '''
    <html>
    <head>
        <title>Mr Nadhif — Live Feed</title>
        <style>
            body { background: #111; display: flex; flex-direction: column;
                   align-items: center; justify-content: center; height: 100vh; margin: 0; }
            h2   { color: #0ff; font-family: monospace; margin-bottom: 12px; }
            img  { border: 2px solid #0ff; border-radius: 4px; max-width: 100%; }
        </style>
    </head>
    <body>
        <h2>&#x1F916; Mr Nadhif — Live Detection Feed</h2>
        <img src="/stream" />
    </body>
    </html>
    '''

@app.route('/stream')
def stream():
    return Response(
        generate_frames(),
        mimetype='multipart/x-mixed-replace; boundary=frame'
    )

def start_stream_server():
    import logging as _logging
    _logging.getLogger('werkzeug').setLevel(_logging.ERROR)
    app.run(host='0.0.0.0', port=STREAM_PORT, threaded=True)

# ── Non-blocking POST ─────────────────────────
# Runs in a daemon thread so a timeout never delays the main loop
def post(endpoint, payload):
    def _send():
        url = f"{BASE_URL}{endpoint}"
        try:
            res = requests.post(
                url, json=payload,
                headers={ 'x-api-key': API_KEY },
                timeout=5
            )
            log.info(f"POST {endpoint} → {res.status_code}")
        except requests.exceptions.ConnectionError:
            log.error(f"Cannot reach backend at {url}")
        except requests.exceptions.Timeout:
            log.error(f"Request to {endpoint} timed out")
    threading.Thread(target=_send, daemon=True).start()

# ── Servo char map ────────────────────────────
SERVO_CHAR = {
    'plastic':  'P',
    'metal':    'M',
    'valuable': 'V',
    'general':  'G',
}

def send_servo(category):
    global motor_serial
    char = SERVO_CHAR.get(category)
    if char and motor_serial and motor_serial.is_open:
        try:
            motor_serial.write(char.encode())
            log.info(f"Servo command sent: '{char}' for {category}")
        except serial.SerialException as e:
            log.error(f"Failed to send servo command: {e}")

# ── Upload image to Supabase ──────────────────
def upload_image(image_path, category, confidence):
    try:
        timestamp   = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename    = f"{category}_{timestamp}.jpg"
        storage_url = f"{SUPABASE_URL}/storage/v1/object/{SUPABASE_BUCKET}/{filename}"
        with open(image_path, 'rb') as f:
            res = requests.post(
                storage_url,
                headers={
                    'Authorization': f'Bearer {SUPABASE_ANON}',
                    'Content-Type': 'image/jpeg',
                },
                data=f, timeout=10
            )
        if res.status_code in (200, 201):
            public_url = f"{SUPABASE_URL}/storage/v1/object/public/{SUPABASE_BUCKET}/{filename}"
            log.info(f"Image uploaded: {public_url}")
            return public_url
        else:
            log.error(f"Supabase upload failed: {res.status_code} — {res.text}")
            return None
    except Exception as e:
        log.error(f"Image upload error: {e}")
        return None

# ── Log item to DB ────────────────────────────
def log_item(category, image_url=None):
    payload = { 'category': category }
    if current_lat is not None and current_lng is not None:
        payload['location_lat'] = current_lat
        payload['location_lng'] = current_lng
    else:
        log.warning(f"No GPS fix yet — logging {category} without location")
    if image_url:
        payload['image_url'] = image_url
    post('/api/items/log', payload)

# ── GPS handler ───────────────────────────────
def on_gps(line):
    global current_lat, current_lng
    try:
        coords = line[2:]
        lat, lng = coords.split(',')
        current_lat = float(lat.strip())
        current_lng = float(lng.strip())
        log.info(f"GPS stored: {current_lat}, {current_lng}")
    except Exception as e:
        log.error(f"Failed to parse GPS line '{line}': {e}")

# ── Bin state ─────────────────────────────────
bins = [
    { 'id': 1, 'label': 'Plastic',  'full': False },
    { 'id': 2, 'label': 'Metal',    'full': False },
    { 'id': 3, 'label': 'Valuable', 'full': False },
    { 'id': 4, 'label': 'Other',    'full': False },
]

def set_bin_full(label, full):
    for b in bins:
        if b['label'] == label:
            b['full'] = full
            return

def send_bins():
    post('/api/bins/status', { 'bins': bins })

# ── Char handlers ─────────────────────────────
def on_metal_inserted():
    log.info("Metal trash inserted"); log_item('metal'); send_servo('metal')

def on_metal_full():
    log.warning("Metal bin is FULL"); set_bin_full('Metal', True); send_bins()

def on_plastic_inserted():
    log.info("Plastic trash inserted"); log_item('plastic'); send_servo('plastic')

def on_plastic_full():
    log.warning("Plastic bin is FULL"); set_bin_full('Plastic', True); send_bins()

def on_valuable_inserted():
    log.info("Valuable item detected!"); log_item('valuable'); send_servo('valuable')
    post('/api/notifications', { 'type': 'valuable_item_found', 'message': 'Valuable item detected by bin sensor' })

def on_valuable_bin_full():
    log.warning("Valuable bin is FULL"); set_bin_full('Valuable', True); send_bins()

def on_general_inserted():
    log.info("General trash inserted"); log_item('general'); send_servo('general')

def on_general_bin_full():
    log.warning("General bin is FULL"); set_bin_full('Other', True); send_bins()

def on_obstacle_detected():
    log.warning("Obstacle detected!"); post('/api/robot/obstacle/detected', {})

def on_obstacle_cleared():
    log.info("Obstacle cleared"); post('/api/robot/obstacle/cleared', {})

CHAR_HANDLERS = {
    'm': on_metal_inserted, 'M': on_metal_full,
    'p': on_plastic_inserted, 'P': on_plastic_full,
    'v': on_valuable_inserted, 'V': on_valuable_bin_full,
    'g': on_general_inserted, 'G': on_general_bin_full,
    'O': on_obstacle_detected, 'C': on_obstacle_cleared,
}

# ── Sensor serial loop (background thread) ────
def sensor_loop():
    while True:
        try:
            with serial.Serial('/dev/ttyACM0', 9600, timeout=1) as ser:
                log.info("Sensor Arduino connected.")
                buffer = ''
                while True:
                    if ser.in_waiting > 0:
                        raw  = ser.read(1)
                        char = raw.decode('ascii', errors='ignore')
                        if char == '\n':
                            line = buffer.strip()
                            buffer = ''
                            if line.startswith('G:'):
                                on_gps(line)
                            elif len(line) == 1 and line in CHAR_HANDLERS:
                                log.info(f"Char received: '{line}'")
                                CHAR_HANDLERS[line]()
                            elif line:
                                log.debug(f"Received: '{line}'")
                        else:
                            buffer += char
        except serial.SerialException:
            # Silent retry — don't spam the terminal
            time.sleep(5)

# ── Category mapping ──────────────────────────
CATEGORY_MAP = {
    "plastic_bottle": "plastic", "plastic_bag": "plastic",
    "plastic": "plastic", "bottle": "plastic",
    "cup": "plastic", "straw": "plastic",
    "can": "metal", "tin": "metal",
    "metal": "metal", "aluminum": "metal", "steel": "metal",
    "phone": "valuable", "wallet": "wallets",
    "keys": "keys", "watch": "watches",
    "jewelry": "valuable", "laptop": "valuable", "valuable": "valuable",
}

VALUABLE_CATEGORIES = {'valuable', 'watches', 'wallets', 'keys'}

# Colors in RGB (camera outputs RGB, no conversion done)
CATEGORY_COLOR = {
    "plastic":  (255, 165, 0),
    "metal":    (200, 200, 200),
    "valuable": (255, 215, 0),
    "watches":  (255, 215, 0),
    "wallets":  (255, 215, 0),
    "keys":     (255, 215, 0),
    "general":  (0, 255, 0),
    "unknown":  (100, 100, 100),
}

def get_category(class_name):
    return CATEGORY_MAP.get(class_name.lower().strip())

# ── Draw detections ───────────────────────────
def draw_detections(image, detections):
    for det in detections:
        x1, y1, x2, y2 = det["box"]
        category = det.get("category", "unknown")
        conf     = det["confidence"]
        color    = CATEGORY_COLOR.get(category, (0, 255, 0))
        cv2.rectangle(image, (x1, y1), (x2, y2), color, 2)
        label = f"{category.upper()} ({det['name']}) {conf:.2f}"
        (w, h), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 2)
        cv2.rectangle(image, (x1, y1 - h - 10), (x1 + w, y1), color, -1)
        cv2.putText(image, label, (x1, y1 - 5),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 0, 0), 2)
    return image

# ── Main ──────────────────────────────────────
def main():
    global motor_serial, latest_frame

    log.info("Connecting to motor Arduino on /dev/ttyACM1...")
    try:
        motor_serial = serial.Serial('/dev/ttyACM1', 9600, timeout=1)
        time.sleep(2)
        log.info("Motor Arduino connected.")
    except serial.SerialException as e:
        log.warning(f"Motor Arduino not found: {e}")
        log.warning("Continuing without motor control.")

    threading.Thread(target=sensor_loop, daemon=True).start()
    threading.Thread(target=start_stream_server, daemon=True).start()
    log.info(f"Live feed → http://0.0.0.0:{STREAM_PORT}  (use your Pi's IP)")

    log.info("Initializing camera...")
    camera = Picamera2()
    config = camera.create_video_configuration(
        main={ 'size': (640, 480), 'format': 'RGB888' },
        controls={
            'AfMode': 2, 'AfSpeed': 1,
            'AwbEnable': True, 'AeEnable': True,
            'FrameRate': 30,
        },
    )
    camera.configure(config)
    camera.start()

    log.info("Waiting for camera warm-up and autofocus...")
    time.sleep(3)
    try:
        camera.autofocus_cycle()
        time.sleep(1)
        log.info("Autofocus complete")
    except Exception as e:
        log.warning(f"Autofocus: {e}")

    log.info(f"Loading YOLO model from {MODEL_PATH}...")
    model = YOLO(MODEL_PATH)
    log.info("YOLO model loaded.")

    temp_dir               = tempfile.mkdtemp(prefix='mrnadhif_')
    last_capture_time      = 0
    last_refocus_time      = time.time()
    current_detections     = []
    capture_count          = 0
    total_detections_count = 0

    log.info("Detection started. Press Ctrl+C to quit.")

    try:
        while True:
            # Camera gives RGB888 — use directly, no conversion
            frame        = camera.capture_array()
            current_time = time.time()
            display      = frame.copy()

            # Auto-refocus (non-blocking check)
            if current_time - last_refocus_time >= REFOCUS_INTERVAL:
                try:
                    camera.autofocus_cycle()
                    last_refocus_time = current_time
                    log.info("Auto-refocus done")
                except:
                    pass

            # ── YOLO inference every CAPTURE_INTERVAL seconds ──
            if current_time - last_capture_time >= CAPTURE_INTERVAL:
                capture_count += 1
                timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
                temp_path = os.path.join(temp_dir, f'cap_{timestamp}.jpg')

                # Resize to YOLO_IMGSZ for faster inference, save full frame separately
                small = cv2.resize(frame, (YOLO_IMGSZ, YOLO_IMGSZ))
                cv2.imwrite(temp_path, small)

                log.info(f"Capture #{capture_count} — running YOLO at {YOLO_IMGSZ}px...")
                t0 = time.time()

                try:
                    results = model(temp_path, conf=CONFIDENCE, iou=IOU, verbose=False)
                    raw_detections = []

                    # Scale boxes back up to 640x480
                    fx = frame.shape[1] / YOLO_IMGSZ
                    fy = frame.shape[0] / YOLO_IMGSZ

                    for r in results:
                        for box in r.boxes:
                            x1, y1, x2, y2 = box.xyxy[0]
                            raw_detections.append({
                                'name':       model.names[int(box.cls)],
                                'confidence': float(box.conf),
                                'box': [
                                    int(x1 * fx), int(y1 * fy),
                                    int(x2 * fx), int(y2 * fy),
                                ],
                            })
                    log.info(f"YOLO done in {(time.time()-t0)*1000:.0f}ms — {len(raw_detections)} detection(s)")

                except Exception as e:
                    log.error(f"YOLO error: {e}")
                    raw_detections = None

                if raw_detections is not None:
                    current_detections = []
                    for det in raw_detections:
                        category = get_category(det["name"])
                        if category is None:
                            log.warning(f"Unknown class '{det['name']}' — add to CATEGORY_MAP")
                            det["category"] = "unknown"
                        else:
                            det["category"] = category
                            send_servo(category)

                            now = time.time()
                            if category in last_detected and (now - last_detected[category]) < DETECTION_COOLDOWN:
                                log.info(f"Skipping {category} — cooldown active")
                            else:
                                last_detected[category] = now
                                if category in VALUABLE_CATEGORIES:
                                    # Save full-res frame for upload
                                    full_path = temp_path.replace('.jpg', '_full.jpg')
                                    cv2.imwrite(full_path, frame)
                                    # Upload in background so it doesn't block
                                    def _upload_and_log(fp, cat, conf):
                                        url = upload_image(fp, cat, conf)
                                        log_item(cat, image_url=url)
                                        post('/api/notifications', {
                                            'type': 'valuable_item_found',
                                            'message': f'Camera detected a valuable item: {cat}'
                                        })
                                        try: os.remove(fp)
                                        except: pass
                                    threading.Thread(
                                        target=_upload_and_log,
                                        args=(full_path, category, det["confidence"]),
                                        daemon=True
                                    ).start()
                                else:
                                    log_item(category)

                        current_detections.append(det)

                    total_detections_count += len(current_detections)

                # Clean up small inference image
                try:
                    os.remove(temp_path)
                except:
                    pass

                last_capture_time = current_time

            # Draw bounding boxes
            display = draw_detections(display, current_detections)

            # HUD
            time_until_next = max(0, CAPTURE_INTERVAL - (current_time - last_capture_time))
            cv2.putText(display, f"Next scan: {time_until_next:.1f}s",       (10, 30),  cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)
            cv2.putText(display, f"Captures: {capture_count}",               (10, 60),  cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)
            cv2.putText(display, f"In frame: {len(current_detections)}",     (10, 90),  cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0),   2)
            cv2.putText(display, f"Total detections: {total_detections_count}", (10, 120), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

            # Push annotated frame to MJPEG stream
            with latest_frame_lock:
                latest_frame = display

    except KeyboardInterrupt:
        log.info("Interrupted by user")

    finally:
        camera.stop()
        if motor_serial and motor_serial.is_open:
            motor_serial.close()
        try:
            for f in os.listdir(temp_dir):
                os.remove(os.path.join(temp_dir, f))
            os.rmdir(temp_dir)
        except:
            pass
        log.info(f"Session ended — Captures: {capture_count} | Detections: {total_detections_count}")


if __name__ == '__main__':
    main()