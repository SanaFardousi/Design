# ─────────────────────────────────────────────
#  Mr Nadhif – Main Pi Controller
#
#  Main thread  → Camera + YOLO + display
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

# ── Config ────────────────────────────────────
SENSOR_PORT = '/dev/ttyACM0'
MOTOR_PORT  = '/dev/ttyACM1'
BAUD_RATE   = 9600

BASE_URL = 'https://implacental-evelina-atmosphereless.ngrok-free.dev'
API_KEY  = 'test123'

# ── Camera / YOLO config ──────────────────────
YOLO_API_KEY     = 'b42e02b5a56c145f6ae7513aae888cdf9f570fa970'
YOLO_ENDPOINT    = 'https://predict-f8mbbq9g6kiwnrd4umec-7nza6zqsha-ez.a.run.app'
YOLO_CONFIDENCE  = 0.25
YOLO_IOU         = 0.45
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

# Shared camera frame
latest_frame = None
frame_lock   = threading.Lock()

bins = [
    { 'id': 1, 'label': 'Plastic',  'full': False },
    { 'id': 2, 'label': 'Metal',    'full': False },
    { 'id': 3, 'label': 'Valuable', 'full': False },
    { 'id': 4, 'label': 'Other',    'full': False },
]

# ── Category mapping ──────────────────────────
CATEGORY_MAP = {
    'plastic_bottle': 'plastic',
    'plastic_bag':    'plastic',
    'plastic':        'plastic',
    'bottle':         'plastic',
    'cup':            'plastic',
    'straw':          'plastic',
    'can':            'metal',
    'tin':            'metal',
    'metal':          'metal',
    'aluminum':       'metal',
    'steel':          'metal',
    'phone':          'valuable',
    'wallet':         'valuable',
    'keys':           'valuable',
    'watch':          'valuable',
    'jewelry':        'valuable',
    'laptop':         'valuable',
    'valuable':       'valuable',
}

SERVO_CHAR = {
    'plastic':  'P',
    'metal':    'M',
    'valuable': 'V',
    'general':  'G',
}

CATEGORY_COLOR = {
    'plastic':  (0, 165, 255),
    'metal':    (200, 200, 200),
    'valuable': (0, 215, 255),
    'general':  (0, 255, 0),
    'unknown':  (100, 100, 100),
}

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

# ── Send servo command to motor Arduino ───────
def send_servo(category):
    global motor_serial
    char = SERVO_CHAR.get(category)
    if char and motor_serial and motor_serial.is_open:
        try:
            motor_serial.write(char.encode())
            log.info(f"Servo command sent: '{char}' for {category}")
        except serial.SerialException as e:
            log.error(f"Failed to send servo command: {e}")

# ── Log item to DB ────────────────────────────
def log_item(category):
    payload = { 'category': category }
    if current_lat is not None and current_lng is not None:
        payload['location_lat'] = current_lat
        payload['location_lng'] = current_lng
    else:
        log.warning(f"No GPS fix yet — logging {category} without location")
    post('/api/items/log', payload)

# ── Bin helpers ───────────────────────────────
def set_bin_full(label, full):
    for b in bins:
        if b['label'] == label:
            b['full'] = full
            return

def send_bins():
    post('/api/bins/status', { 'bins': bins })

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

# ── Sensor char handlers ──────────────────────
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

# ── YOLO detection ────────────────────────────
def detect_from_file(image_path):
    try:
        headers = { 'x-api-key': YOLO_API_KEY }
        data    = { 'imgsz': 640, 'conf': YOLO_CONFIDENCE, 'iou': YOLO_IOU }

        with open(image_path, 'rb') as f:
            res = requests.post(
                YOLO_ENDPOINT,
                headers=headers,
                data=data,
                files={ 'file': f },
                timeout=10
            )
        res.raise_for_status()
        result = res.json()

        detections = []
        if 'images' in result and result['images']:
            for det in result['images'][0].get('results', []):
                box = det['box']
                detections.append({
                    'class':      det['class'],
                    'name':       det['name'],
                    'confidence': det['confidence'],
                    'box': [
                        int(box['x1']), int(box['y1']),
                        int(box['x2']), int(box['y2']),
                    ],
                })
        return detections

    except Exception as e:
        log.error(f"YOLO API error: {e}")
        return None

# ── Draw detections on frame ──────────────────
def draw_detections(image, detections):
    for det in detections:
        x1, y1, x2, y2 = det['box']
        category = det.get('category', 'unknown')
        conf     = det['confidence']
        color    = CATEGORY_COLOR.get(category, (0, 255, 0))

        cv2.rectangle(image, (x1, y1), (x2, y2), color, 2)

        label = f"{category.upper()} ({det['name']}) {conf:.2f}"
        (w, h), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 2)
        cv2.rectangle(image, (x1, y1 - h - 10), (x1 + w, y1), color, -1)
        cv2.putText(image, label, (x1, y1 - 5),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 0, 0), 2)

    return image

# ── Sensor serial loop (background thread) ────
def sensor_loop():
    log.info(f"Connecting to sensor Arduino on {SENSOR_PORT}...")
    while True:
        try:
            with serial.Serial(SENSOR_PORT, BAUD_RATE, timeout=1) as ser:
                log.info("Sensor Arduino connected. Listening...")
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
                                log.debug(f"Unknown data: '{line}'")
                        else:
                            buffer += char

        except serial.SerialException as e:
            log.error(f"Sensor serial error: {e}. Retrying in 5s...")
            time.sleep(5)

# ── Camera capture thread ─────────────────────
def camera_capture_thread(camera):
    global latest_frame
    while True:
        new_frame = camera.capture_array()
        with frame_lock:
            latest_frame = new_frame.copy()

# ── Main (display + YOLO in main thread) ──────
def main():
    global motor_serial

    # Connect to motor Arduino
    log.info(f"Connecting to motor Arduino on {MOTOR_PORT}...")
    try:
        motor_serial = serial.Serial(MOTOR_PORT, BAUD_RATE, timeout=1)
        time.sleep(2)
        log.info("Motor Arduino connected.")
    except serial.SerialException as e:
        log.warning(f"Motor Arduino not found: {e}")
        log.warning("Continuing without motor control.")

    # Start sensor loop in background thread
    threading.Thread(target=sensor_loop, daemon=True).start()

    # ── Camera setup ──────────────────────────
    log.info("Initializing camera...")
    camera = Picamera2()
    config = camera.create_preview_configuration(
        main={ 'size': (640, 480), 'format': 'RGB888' },
        controls={
            'AfMode': 2, 'AfSpeed': 1,
            'AwbEnable': True, 'AeEnable': True,
        },
    )
    camera.configure(config)
    camera.start()
    time.sleep(3)

    try:
        camera.autofocus_cycle()
        time.sleep(1)
        log.info("Autofocus complete")
    except Exception as e:
        log.warning(f"Autofocus: {e}")

    # Start camera capture in background thread
    threading.Thread(target=camera_capture_thread, args=(camera,), daemon=True).start()

    # Wait for first frame
    while latest_frame is None:
        time.sleep(0.1)
    log.info("First frame received.")

    temp_dir               = tempfile.mkdtemp(prefix='mrnadhif_')
    last_capture_time      = 0
    last_refocus_time      = time.time()
    current_detections     = []
    capture_count          = 0
    total_detections_count = 0

    log.info("Detection started. Press 'q' to quit, 'f' to refocus.")

    try:
        while True:
            with frame_lock:
                frame = latest_frame.copy()

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

                log.info(f"Capture #{capture_count} — sending to YOLO...")
                t0  = time.time()
                raw = detect_from_file(temp_path)
                log.info(f"YOLO response in {(time.time()-t0)*1000:.0f}ms")

                if raw is not None:
                    current_detections = []
                    for det in raw:
                        category = CATEGORY_MAP.get(det['name'].lower().strip())
                        if category:
                            det['category'] = category
                            log.info(f"Detected: {det['name']} → {category}")
                            log_item(category)
                            send_servo(category)
                        else:
                            det['category'] = 'unknown'
                            log.warning(f"Unknown class '{det['name']}' — add to CATEGORY_MAP")
                        current_detections.append(det)

                    total_detections_count += len(current_detections)

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

            key = cv2.waitKey(1) & 0xFF
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