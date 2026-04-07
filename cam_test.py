# ─────────────────────────────────────────────
#  Mr Nadhif – Main Pi Controller
#
#  Main thread  → Camera + local YOLO + display
#  Background   → Sensor serial (Arduino 1)
#  Motor serial → Arduino 2 (servo commands)
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
CAPTURE_INTERVAL = 2    # seconds between captures
REFOCUS_INTERVAL = 20   # seconds between auto-refocus

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

last_detected      = {}   # category → last detection timestamp
DETECTION_COOLDOWN = 10   # seconds

# ── Servo char map ────────────────────────────
SERVO_CHAR = {
    'plastic':  'P',
    'metal':    'M',
    'valuable': 'V',
    'general':  'G',
}

# ── Send servo command ────────────────────────
def send_servo(category):
    global motor_serial
    char = SERVO_CHAR.get(category)
    if char and motor_serial and motor_serial.is_open:
        try:
            motor_serial.write(char.encode())
            log.info(f"Servo command sent: '{char}' for {category}")
        except serial.SerialException as e:
            log.error(f"Failed to send servo command: {e}")

# ── POST helper ───────────────────────────────
def post(endpoint, payload):
    url = f"{BASE_URL}{endpoint}"
    try:
        res = requests.post(
            url,
            json=payload,
            headers={ 'x-api-key': API_KEY },
            timeout=5
        )
        log.info(f"POST {endpoint} → {res.status_code}")
    except requests.exceptions.ConnectionError:
        log.error(f"Cannot reach backend at {url}")
    except requests.exceptions.Timeout:
        log.error(f"Request to {endpoint} timed out")

# ── Upload image to Supabase Storage ─────────
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
                data=f,
                timeout=10
            )

        if res.status_code in (200, 201):
            public_url = f"{SUPABASE_URL}/storage/v1/object/public/{SUPABASE_BUCKET}/{filename}"
            log.info(f"Image uploaded to Supabase: {public_url}")
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
        log.info(f"Sending GPS: {current_lat}, {current_lng}")
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
    log.info("Metal trash inserted")
    log_item('metal')
    send_servo('metal')

def on_metal_full():
    log.warning("Metal bin is FULL")
    set_bin_full('Metal', True)
    send_bins()

def on_plastic_inserted():
    log.info("Plastic trash inserted")
    log_item('plastic')
    send_servo('plastic')

def on_plastic_full():
    log.warning("Plastic bin is FULL")
    set_bin_full('Plastic', True)
    send_bins()

def on_valuable_inserted():
    log.info("Valuable item detected!")
    log_item('valuable')
    send_servo('valuable')
    post('/api/notifications', {
        'type': 'valuable_item_found',
        'message': 'Valuable item detected by bin sensor'
    })

def on_valuable_bin_full():
    log.warning("Valuable bin is FULL")
    set_bin_full('Valuable', True)
    send_bins()

def on_general_inserted():
    log.info("General trash inserted")
    log_item('general')
    send_servo('general')

def on_general_bin_full():
    log.warning("General bin is FULL")
    set_bin_full('Other', True)
    send_bins()

def on_obstacle_detected():
    log.warning("Obstacle detected!")
    post('/api/robot/obstacle/detected', {})

def on_obstacle_cleared():
    log.info("Obstacle cleared")
    post('/api/robot/obstacle/cleared', {})

CHAR_HANDLERS = {
    'm': on_metal_inserted,
    'M': on_metal_full,
    'p': on_plastic_inserted,
    'P': on_plastic_full,
    'v': on_valuable_inserted,
    'V': on_valuable_bin_full,
    'g': on_general_inserted,
    'G': on_general_bin_full,
    'O': on_obstacle_detected,
    'C': on_obstacle_cleared,
}

# ── Sensor serial loop (background thread) ────
def sensor_loop():
    while True:
        try:
            with serial.Serial('/dev/ttyACM0', 9600, timeout=1) as ser:
                print("Sensor Arduino connected.")
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
                                print(f"Received: '{line}'")
                        else:
                            buffer += char
        except serial.SerialException as e:
            print(f"Serial error: {e}. Retrying in 5s...")
            time.sleep(5)

# ── Category mapping ──────────────────────────
CATEGORY_MAP = {
    # --- PLASTIC ---
    "plastic_bottle": "plastic",
    "plastic_bag":    "plastic",
    "plastic":        "plastic",
    "bottle":         "plastic",
    "cup":            "plastic",
    "straw":          "plastic",

    # --- METAL ---
    "can":            "metal",
    "tin":            "metal",
    "metal":          "metal",
    "aluminum":       "metal",
    "steel":          "metal",

    # --- VALUABLE ---
    "phone":          "valuable",
    "wallet":         "wallets",
    "keys":           "keys",
    "watch":          "watches",
    "jewelry":        "valuable",
    "laptop":         "valuable",
    "valuable":       "valuable",
}

VALUABLE_CATEGORIES = {'valuable', 'watches', 'wallets', 'keys'}

CATEGORY_COLOR = {
    "plastic":  (0, 165, 255),
    "metal":    (200, 200, 200),
    "valuable": (0, 215, 255),
    "watches":  (0, 215, 255),
    "wallets":  (0, 215, 255),
    "keys":     (0, 215, 255),
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
    global motor_serial

    # Connect to motor Arduino
    log.info("Connecting to motor Arduino on /dev/ttyACM1...")
    try:
        motor_serial = serial.Serial('/dev/ttyACM1', 9600, timeout=1)
        time.sleep(2)
        log.info("Motor Arduino connected.")
    except serial.SerialException as e:
        log.warning(f"Motor Arduino not found: {e}")
        log.warning("Continuing without motor control.")

    # Start sensor loop in background thread
    threading.Thread(target=sensor_loop, daemon=True).start()

    # Load local YOLO model
    log.info(f"Loading YOLO model from {MODEL_PATH}...")
    model = YOLO(MODEL_PATH)
    log.info("YOLO model loaded.")

    # Camera setup
    log.info("Initializing camera...")
    camera = Picamera2()
    config = camera.create_still_configuration(
        main={ 'size': (640, 480), 'format': 'RGB888' },
        controls={
            'AfMode': 2, 'AfSpeed': 1,
            'AwbEnable': True, 'AeEnable': True,
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

    temp_dir               = tempfile.mkdtemp(prefix='mrnadhif_')
    last_capture_time      = 0
    last_refocus_time      = time.time()
    current_detections     = []
    capture_count          = 0
    total_detections_count = 0

    log.info("Detection started. Press 'q' to quit, 'f' to refocus.")

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

            # Capture & detect
            if current_time - last_capture_time >= CAPTURE_INTERVAL:
                capture_count += 1
                timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
                temp_path = os.path.join(temp_dir, f'cap_{timestamp}.jpg')
                cv2.imwrite(temp_path, display)

                log.info(f"Capture #{capture_count} — running YOLO...")
                t0 = time.time()

                try:
                    results = model(temp_path, conf=CONFIDENCE, iou=IOU, verbose=False)
                    raw_detections = []
                    for r in results:
                        for box in r.boxes:
                            raw_detections.append({
                                'name':       model.names[int(box.cls)],
                                'confidence': float(box.conf),
                                'box': [
                                    int(box.xyxy[0][0]),
                                    int(box.xyxy[0][1]),
                                    int(box.xyxy[0][2]),
                                    int(box.xyxy[0][3]),
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

                            # Cooldown check
                            now = time.time()
                            if category in last_detected and (now - last_detected[category]) < DETECTION_COOLDOWN:
                                log.info(f"Skipping {category} — cooldown active")
                            else:
                                last_detected[category] = now

                                if category in VALUABLE_CATEGORIES:
                                    image_url = upload_image(temp_path, category, det["confidence"])
                                    log_item(category, image_url=image_url)
                                    post('/api/notifications', {
                                        'type': 'valuable_item_found',
                                        'message': f'Camera detected a valuable item: {category}'
                                    })
                                else:
                                    log_item(category)

                        current_detections.append(det)

                    total_detections_count += len(current_detections)

                # Delete temp image unless it had a valuable
                has_valuable = any(
                    get_category(det["name"]) in VALUABLE_CATEGORIES
                    for det in (raw_detections or [])
                )
                if not has_valuable:
                    try:
                        os.remove(temp_path)
                    except:
                        pass

                last_capture_time = current_time

            # Draw bounding boxes
            display = draw_detections(display, current_detections)

            # HUD
            time_until_next = max(0, CAPTURE_INTERVAL - (current_time - last_capture_time))
            cv2.putText(display, f"Next: {time_until_next:.1f}s",        (10, 30),  cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)
            cv2.putText(display, f"Captures: {capture_count}",           (10, 60),  cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)
            cv2.putText(display, f"In frame: {len(current_detections)}", (10, 90),  cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0),   2)
            cv2.putText(display, f"Total: {total_detections_count}",     (10, 120), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0),   2)

            cv2.imshow('Mr Nadhif — Detection', display)

            key = cv2.waitKey(100) & 0xFF
            if key == ord('q'):
                log.info("Stopping...")
                break
            elif key == ord('f'):
                try:
                    camera.autofocus_cycle()
                    log.info("Manual refocus done")
                except Exception as e:
                    log.warning(f"Refocus: {e}")

    except KeyboardInterrupt:
        log.info("Interrupted by user")

    finally:
        camera.stop()
        cv2.destroyAllWindows()
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