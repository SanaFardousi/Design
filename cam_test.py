# ─────────────────────────────────────────────
#  Mr Nadhif – Main Pi Controller
#
#  Main loop    → Camera + YOLO + annotated stream
#  Sensor loop  → Arduino 1 serial (background thread)
#  Motor serial → Arduino 2 (servo commands)
#  POST calls   → Fire-and-forget daemon threads (never block main loop)
#  Command poll → Checks backend every 30s for scheduled start commands
#  Telemetry    → Sends battery + GPS to backend every 15s
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

# ── Backend config (env-overridable) ──────────
# Override: export NADHIF_BASE_URL=http://192.168.1.5:5000
#           export NADHIF_API_KEY=newkey
BASE_URL = os.environ.get('NADHIF_BASE_URL', 'http://172.20.10.6:5000')
API_KEY  = os.environ.get('NADHIF_API_KEY',  'test123')

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

# ── Lifecycle config ──────────────────────────
COMMAND_POLL_INTERVAL     = 30   # seconds between /next-command polls
TELEMETRY_INTERVAL        = 15   # seconds between /telemetry posts
BATTERY_LEVEL_PLACEHOLDER = 100  # TODO: wire real battery sensor

# ─────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s'
)
log = logging.getLogger(__name__)
log.info(f"Backend: {BASE_URL}")

# ── Shared state ──────────────────────────────
# GPS: placeholder coords used indoors (real GPS sends 0.0, 0.0)
current_lat  = 29.331533936248828
current_lng  = 48.09277661260742

motor_serial      = None
active_session_id = None   # set by command_poll_loop when a schedule fires

last_detected      = {}
DETECTION_COOLDOWN = 15  # seconds — applies to both servo and DB logging

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

# ── Non-blocking POST (fire-and-forget) ───────
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
            if not res.ok:
                log.warning(f"POST {endpoint} body: {res.text[:200]}")
        except requests.exceptions.ConnectionError:
            log.error(f"Cannot reach backend at {url}")
        except requests.exceptions.Timeout:
            log.error(f"Request to {endpoint} timed out")
        except Exception as e:
            log.error(f"POST {endpoint} error: {e}")
    threading.Thread(target=_send, daemon=True).start()

# ── Synchronous POST (for shutdown — must finish before exit) ───
def post_sync(endpoint, payload):
    url = f"{BASE_URL}{endpoint}"
    try:
        res = requests.post(
            url, json=payload,
            headers={ 'x-api-key': API_KEY },
            timeout=5
        )
        log.info(f"POST {endpoint} → {res.status_code}")
        if res.ok:
            try:
                return res.json()
            except ValueError:
                return None
        return None
    except Exception as e:
        log.error(f"POST {endpoint} error: {e}")
        return None

# ── Command poll loop (background thread) ─────
# Polls the backend every 30s for scheduled start_cleaning commands.
# When one arrives: sets active_session_id so detection can log to DB.
def command_poll_loop():
    global active_session_id
    log.info(f"Command poll loop started — every {COMMAND_POLL_INTERVAL}s")
    while True:
        try:
            res = requests.get(
                f"{BASE_URL}/api/robot/next-command",
                headers={ 'x-api-key': API_KEY },
                timeout=5
            )
            if res.status_code == 200:
                command = res.json().get('command')
                if command:
                    log.info(
                        f"📡 Command received: [{command['command_type']}]"
                        f"  session_id={command['session_id']}"
                        f"  schedule_id={command['schedule_id']}"
                    )
                    ack = requests.post(
                        f"{BASE_URL}/api/robot/acknowledge-command",
                        json={ 'command_id': command['command_id'] },
                        headers={ 'x-api-key': API_KEY },
                        timeout=5
                    )
                    log.info(f"📡 Command acknowledged → {ack.status_code}")

                    if command['command_type'] == 'start_cleaning':
                        payload = command.get('payload') or {}
                        beach   = payload.get('beach_name', 'Unknown')
                        # CRITICAL: set session so log_item/send_servo can fire
                        active_session_id = command['session_id']
                        log.info(f"🤖 Scheduled cleaning started — beach: {beach}  session_id={active_session_id}")
            else:
                log.warning(f"Command poll got unexpected status: {res.status_code}")

        except requests.exceptions.ConnectionError:
            log.error("Command poll: cannot reach backend")
        except requests.exceptions.Timeout:
            log.error("Command poll: request timed out")
        except Exception as e:
            log.error(f"Command poll error: {e}")

        time.sleep(COMMAND_POLL_INTERVAL)

# ── Telemetry thread ──────────────────────────
def telemetry_loop(stop_event):
    """Send battery + GPS to backend every TELEMETRY_INTERVAL seconds."""
    log.info(f"Telemetry loop started — every {TELEMETRY_INTERVAL}s")
    while not stop_event.is_set():
        payload = {
            'battery_level': BATTERY_LEVEL_PLACEHOLDER,
            'current_lat':   current_lat,
            'current_lng':   current_lng,
        }
        post('/api/robot/telemetry', payload)
        stop_event.wait(TELEMETRY_INTERVAL)

# ── Servo char map ────────────────────────────
# All valuable subtypes (watches/wallets/keys/sunglasses/valuable) → 'V' bin.
SERVO_CHAR = {
    'plastic':    'P',
    'metal':      'M',
    'valuable':   'V',
    'watches':    'V',
    'wallets':    'V',
    'keys':       'V',
    'sunglasses': 'V',
    'general':    'G',
}

def send_servo(category):
    global motor_serial, active_session_id
    if active_session_id is None:
        log.debug(f"No active session; skipping servo for {category}")
        return
    char = SERVO_CHAR.get(category)
    if not char:
        log.warning(f"No servo mapping for category '{category}'")
        return
    if motor_serial and motor_serial.is_open:
        try:
            motor_serial.write(char.encode())
            log.info(f"Servo command sent: '{char}' for {category}")
        except serial.SerialException as e:
            log.error(f"Failed to send servo command: {e}")
    else:
        log.warning(f"Motor serial not open; would send '{char}' for {category}")

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
# Gates on active_session_id — if no session, skip. Backend also auto-fires
# SMS/notification for valuable categories via createAlert.
def log_item(category, image_url=None):
    if active_session_id is None:
        log.info(f"No active session; skipping log for {category}")
        return
    payload = {
        'category':     category,
        'session_id':   active_session_id,
        'location_lat': current_lat,
        'location_lng': current_lng,
    }
    if image_url:
        payload['image_url'] = image_url
    post('/api/items/log', payload)

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
    # Backend auto-alerts on 'valuable' via createAlert — no manual POST.
    log.info("Valuable item detected!"); log_item('valuable'); send_servo('valuable')

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
    'm': on_metal_inserted,   'M': on_metal_full,
    'p': on_plastic_inserted, 'P': on_plastic_full,
    'v': on_valuable_inserted,'V': on_valuable_bin_full,
    'g': on_general_inserted, 'G': on_general_bin_full,
    'O': on_obstacle_detected,'C': on_obstacle_cleared,
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
                            # GPS lines ignored (using placeholder coords)
                            if len(line) == 1 and line in CHAR_HANDLERS:
                                log.info(f"Char received: '{line}'")
                                CHAR_HANDLERS[line]()
                            elif line:
                                log.debug(f"Received: '{line}'")
                        else:
                            buffer += char
        except serial.SerialException:
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
    "sunglasses": "sunglasses",
}

VALUABLE_CATEGORIES = {'valuable', 'watches', 'wallets', 'keys', 'sunglasses'}

# Colors in RGB (camera outputs RGB, no conversion done)
CATEGORY_COLOR = {
    "plastic":    (255, 165, 0),
    "metal":      (200, 200, 200),
    "valuable":   (255, 215, 0),
    "watches":    (255, 215, 0),
    "wallets":    (255, 215, 0),
    "keys":       (255, 215, 0),
    "sunglasses": (255, 215, 0),
    "general":    (0, 255, 0),
    "unknown":    (100, 100, 100),
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
    global motor_serial, latest_frame, active_session_id

    log.info("Connecting to motor Arduino on /dev/ttyACM1...")
    try:
        motor_serial = serial.Serial('/dev/ttyACM1', 9600, timeout=1)
        time.sleep(2)
        log.info("Motor Arduino connected.")
    except serial.SerialException as e:
        log.warning(f"Motor Arduino not found: {e}")
        log.warning("Continuing without motor control.")

    # Background threads (all daemon — die when main exits)
    threading.Thread(target=sensor_loop,         daemon=True).start()
    threading.Thread(target=start_stream_server, daemon=True).start()
    threading.Thread(target=command_poll_loop,   daemon=True).start()

    telemetry_stop = threading.Event()
    threading.Thread(
        target=telemetry_loop,
        args=(telemetry_stop,),
        daemon=True
    ).start()

    log.info(f"Live feed → http://0.0.0.0:{STREAM_PORT}  (use your Pi's IP)")

    # ── Camera (using still_configuration — the one that worked before) ──
    log.info("Initializing camera...")
    camera = Picamera2()
    config = camera.create_still_configuration(
        main={"size": (640, 480), "format": "RGB888"},
        controls={
            "AfMode":    2,
            "AfSpeed":   1,
            "AwbEnable": True,
            "AeEnable":  True,
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

    log.info("─" * 55)
    log.info(f"  Placeholder GPS   : {current_lat}, {current_lng}")
    log.info(f"  Capture interval  : {CAPTURE_INTERVAL}s")
    log.info(f"  Detection cooldown: {DETECTION_COOLDOWN}s")
    log.info(f"  Confidence thresh : {CONFIDENCE}")
    log.info(f"  YOLO image size   : {YOLO_IMGSZ}px")
    log.info(f"  Command poll      : every {COMMAND_POLL_INTERVAL}s")
    log.info(f"  Telemetry         : every {TELEMETRY_INTERVAL}s")
    log.info(f"  Stream            : http://0.0.0.0:{STREAM_PORT}")
    log.info("─" * 55)
    log.info("Detection started. Press Ctrl+C to quit.")
    log.info("Waiting for scheduled session (or detections will be ignored)...")

    try:
        while True:
            frame        = camera.capture_array()
            current_time = time.time()
            display      = frame.copy()

            # Auto-refocus
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

                small = cv2.resize(frame, (YOLO_IMGSZ, YOLO_IMGSZ))
                cv2.imwrite(temp_path, small)

                log.info(f"━━━ Capture #{capture_count} ━━━  running YOLO at {YOLO_IMGSZ}px ...")
                t0 = time.time()

                try:
                    results = model(temp_path, conf=CONFIDENCE, iou=IOU, verbose=False)
                    raw_detections = []

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
                    inference_ms = (time.time() - t0) * 1000
                    log.info(f"YOLO done in {inference_ms:.0f}ms — {len(raw_detections)} raw detection(s)")

                except Exception as e:
                    log.error(f"YOLO error: {e}")
                    raw_detections = None

                if raw_detections is not None:
                    current_detections = []

                    if not raw_detections:
                        log.info("  └─ Nothing detected in frame")

                    for det in raw_detections:
                        category = get_category(det["name"])
                        conf_pct = det["confidence"] * 100

                        if category is None:
                            log.warning(
                                f"  ⚠  Unknown class  : '{det['name']}'  ({conf_pct:.1f}%)  — add to CATEGORY_MAP"
                            )
                            det["category"] = "unknown"
                        else:
                            det["category"] = category

                            now = time.time()
                            cooldown_remaining = DETECTION_COOLDOWN - (now - last_detected.get(category, 0))

                            if cooldown_remaining > 0:
                                log.info(
                                    f"  ⏳ [{category.upper():10s}]  '{det['name']}'  {conf_pct:.1f}%"
                                    f"  — cooldown {cooldown_remaining:.1f}s left, skipping"
                                )
                            else:
                                last_detected[category] = now
                                send_servo(category)

                                if active_session_id is None:
                                    log.info(
                                        f"  🔒 [{category.upper():10s}]  '{det['name']}'  {conf_pct:.1f}%"
                                        f"  — no active session, not logging"
                                    )
                                else:
                                    tag = "💎 VALUABLE" if category in VALUABLE_CATEGORIES else "🗑  TRASH"
                                    log.info(
                                        f"  ✅ {tag}  [{category.upper():10s}]  '{det['name']}'  {conf_pct:.1f}%"
                                        f"  → logging to DB"
                                    )

                                    if category in VALUABLE_CATEGORIES:
                                        full_path = temp_path.replace('.jpg', '_full.jpg')
                                        cv2.imwrite(full_path, frame)
                                        log.info(f"     📸 Saved full-res frame → uploading to Supabase...")
                                        def _upload_and_log(fp, cat, conf):
                                            url = upload_image(fp, cat, conf)
                                            if url:
                                                log.info(f"     ☁  Supabase upload OK  : {url}")
                                            # Backend auto-fires valuable_item_found alert via createAlert
                                            log_item(cat, image_url=url)
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
                    if current_detections:
                        log.info(
                            f"  📊 Frame summary  : {len(current_detections)} object(s) | "
                            f"session total: {total_detections_count}"
                        )

                try:
                    os.remove(temp_path)
                except:
                    pass

                last_capture_time = current_time

            # Draw bounding boxes
            display = draw_detections(display, current_detections)

            # HUD
            time_until_next = max(0, CAPTURE_INTERVAL - (current_time - last_capture_time))
            session_text = f"Session: {active_session_id}" if active_session_id else "Session: (idle)"
            cv2.putText(display, session_text,                                   (10, 30),  cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)
            cv2.putText(display, f"Next scan: {time_until_next:.1f}s",          (10, 55),  cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)
            cv2.putText(display, f"Captures: {capture_count}",                  (10, 80),  cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)
            cv2.putText(display, f"In frame: {len(current_detections)}",        (10, 105), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0),   2)
            cv2.putText(display, f"Total detections: {total_detections_count}", (10, 130), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0),   2)

            with latest_frame_lock:
                latest_frame = display

    except KeyboardInterrupt:
        log.info("Interrupted by user")

    finally:
        # Stop telemetry
        telemetry_stop.set()

        # Complete the session if one was active (synchronous — must finish before exit)
        if active_session_id is not None:
            log.info(f"Completing session {active_session_id} on backend...")
            result = post_sync('/api/robot/complete-session', {})
            if result and result.get('success'):
                log.info(f"Session {result.get('session_id')} marked completed")
            else:
                log.warning("Could not complete session on backend")

        try:
            camera.stop()
        except Exception as e:
            log.error(f"Camera stop error: {e}")

        if motor_serial and motor_serial.is_open:
            try:
                motor_serial.close()
                log.info("Motor serial closed")
            except Exception as e:
                log.error(f"Motor serial close error: {e}")

        try:
            for f in os.listdir(temp_dir):
                os.remove(os.path.join(temp_dir, f))
            os.rmdir(temp_dir)
        except:
            pass

        log.info("─" * 55)
        log.info(f"  Session ended")
        log.info(f"  Session ID       : {active_session_id}")
        log.info(f"  Total captures   : {capture_count}")
        log.info(f"  Total detections : {total_detections_count}")
        log.info("─" * 55)


if __name__ == '__main__':
    main()