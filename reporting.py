import cv2
import json
import requests
import time
import os
import tempfile
import serial
import threading
import logging
from datetime import datetime
from picamera2 import Picamera2

# ── Backend config ────────────────────────────
BASE_URL = 'https://implacental-evelina-atmosphereless.ngrok-free.dev'
API_KEY  = 'test123'

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s'
)
log = logging.getLogger(__name__)

# ── GPS stored in memory ──────────────────────
current_lat  = None
current_lng  = None
motor_serial = None

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

# ── Log item to DB ────────────────────────────
def log_item(category):
    payload = { 'category': category }
    if current_lat is not None and current_lng is not None:
        payload['location_lat'] = current_lat
        payload['location_lng'] = current_lng
    else:
        log.warning(f"No GPS fix yet — logging {category} without location")
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


# ── Sensor thread (only addition) ────────────
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

# ========================================
# CATEGORY MAPPING
# ========================================
# Map your model's class names to one of 3 categories
# Edit this to match your model's actual class names!
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
    "wallet":         "valuable",
    "keys":           "valuable",
    "watch":          "valuable",
    "jewelry":        "valuable",
    "laptop":         "valuable",
    "valuable":       "valuable",
}

# Char sent to Arduino for each category
SERIAL_CHAR = {
    "plastic":  "P",
    "metal":    "M",
    "valuable": "V",
}

# Category display colors (BGR)
CATEGORY_COLOR = {
    "plastic":  (0, 165, 255),   # Orange
    "metal":    (200, 200, 200), # Silver/Gray
    "valuable": (0, 215, 255),   # Gold
}


def get_category(class_name: str) -> str | None:
    """Map a raw model class name to one of the 3 categories."""
    return CATEGORY_MAP.get(class_name.lower().strip())


class ArduinoSerial:
    def __init__(self, port="/dev/ttyUSB0", baud=9600):
        """
        Open serial connection to Arduino.
        Common ports on Pi:
          /dev/ttyUSB0  – USB serial adapter
          /dev/ttyACM0  – Arduino Uno/Mega via USB
        """
        self.ser = None
        try:
            self.ser = serial.Serial(port, baud, timeout=1)
            time.sleep(2)  # Let Arduino reset after connection
            print(f"✔ Arduino connected on {port} @ {baud} baud")
        except serial.SerialException as e:
            print(f"⚠  Could not open serial port {port}: {e}")
            print("   Running without Arduino output.")

    def send(self, char: str):
        """Send a single character to the Arduino."""
        if self.ser and self.ser.is_open:
            try:
                self.ser.write(char.encode())
                print(f"   → Serial: sent '{char}'")
            except serial.SerialException as e:
                print(f"   ✗ Serial write failed: {e}")
        else:
            print(f"   [No Arduino] would send: '{char}'")

    def close(self):
        if self.ser and self.ser.is_open:
            self.ser.close()


class SimpleCloudDetector:
    def __init__(self, api_key, model_url, confidence=0.25, iou=0.45, api_endpoint=None):
        if api_endpoint:
            self.api_url = api_endpoint
            print(f"✔ Using DEDICATED endpoint")
        else:
            self.api_url = "https://predict.ultralytics.com"
            print(f"✔ Using SHARED endpoint (rate limited)")

        self.api_key = api_key
        self.model_url = model_url
        self.confidence = confidence
        self.iou = iou

        print(f"  Endpoint: {self.api_url}")
        print(f"  Model: {model_url}")
        print(f"  Confidence: {confidence}")

    def detect_from_file(self, image_path):
        """Run detection on an image file and return raw detections."""
        try:
            headers = {"x-api-key": self.api_key}

            if self.api_url != "https://predict.ultralytics.com":
                data = {"imgsz": 640, "conf": self.confidence, "iou": self.iou}
            else:
                data = {
                    "model": self.model_url,
                    "imgsz": 640,
                    "conf": self.confidence,
                    "iou": self.iou,
                }

            with open(image_path, "rb") as f:
                files = {"file": f}
                response = requests.post(
                    self.api_url,
                    headers=headers,
                    data=data,
                    files=files,
                    timeout=10,
                )

            response.raise_for_status()
            result = response.json()

            detections = []
            if "images" in result and result["images"]:
                for det in result["images"][0].get("results", []):
                    box = det["box"]
                    detections.append({
                        "class":      det["class"],
                        "name":       det["name"],
                        "confidence": det["confidence"],
                        "box": [
                            int(box["x1"]), int(box["y1"]),
                            int(box["x2"]), int(box["y2"]),
                        ],
                    })

            return detections

        except requests.exceptions.RequestException as e:
            print(f"✗ API Error: {e}")
            return None
        except Exception as e:
            print(f"✗ Error: {e}")
            return None


def draw_detections(image, detections):
    """Draw bounding boxes with category labels on image."""
    for det in detections:
        x1, y1, x2, y2 = det["box"]
        category = det.get("category", "unknown")
        conf = det["confidence"]
        color = CATEGORY_COLOR.get(category, (0, 255, 0))

        cv2.rectangle(image, (x1, y1), (x2, y2), color, 2)

        label = f"{category.upper()} ({det['name']}) {conf:.2f}"
        (w, h), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 2)
        cv2.rectangle(image, (x1, y1 - h - 10), (x1 + w, y1), color, -1)
        cv2.putText(image, label, (x1, y1 - 5),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 0, 0), 2)

    return image


def main():
    # ========================================
    # CONFIGURATION
    # ========================================
    API_KEY           = "b42e02b5a56c145f6ae7513aae888cdf9f570fa970"
    MODEL_URL         = "https://hub.ultralytics.com/models/g6ukybMzSi9dDpghhDTY"
    CONFIDENCE        = 0.25
    IOU               = 0.45
    CAPTURE_INTERVAL  = 2       # Seconds between captures
    REFOCUS_INTERVAL  = 20      # Seconds between auto-refocus

    DEDICATED_ENDPOINT = "https://predict-f8mbbq9g6kiwnrd4umec-7nza6zqsha-ez.a.run.app"

    # ---- Arduino serial port ----
    # Change to /dev/ttyACM0 if using a standard Arduino Uno/Mega over USB
    ARDUINO_PORT = "/dev/ttyACM0"
    ARDUINO_BAUD = 9600

    # ---- Arduino ----
    arduino = ArduinoSerial(port=ARDUINO_PORT, baud=ARDUINO_BAUD)

    # ---- Motor Arduino ----
    global motor_serial
    try:
        motor_serial = serial.Serial('/dev/ttyACM1', ARDUINO_BAUD, timeout=1)
        time.sleep(2)
        log.info("Motor Arduino connected on /dev/ttyACM1")
    except serial.SerialException as e:
        log.warning(f"Motor Arduino not found: {e}")
        log.warning("Continuing without motor control.")

    # ---- Sensor thread ----
    threading.Thread(target=sensor_loop, daemon=True).start()

    # ---- Camera ----
    print("🎥 Initializing Pi Camera Module 3...")
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

    print("⏳ Waiting for camera warm-up and autofocus...")
    time.sleep(3)
    try:
        camera.autofocus_cycle()
        time.sleep(1)
        print("✔ Autofocus complete")
    except Exception as e:
        print(f"⚠  Autofocus: {e}")

    # ---- Detector ----
    print("☁  Initializing Ultralytics Cloud API...")
    detector = SimpleCloudDetector(
        API_KEY, MODEL_URL, CONFIDENCE, IOU, api_endpoint=DEDICATED_ENDPOINT
    )

    temp_dir = tempfile.mkdtemp(prefix="detection_")

    print("\n" + "=" * 60)
    print("🚀 DETECTION STARTED  |  3 Categories: Plastic · Metal · Valuable")
    print("=" * 60)
    print(f"  Serial chars → P=plastic  M=metal  V=valuable")
    print(f"  Capture every {CAPTURE_INTERVAL}s   |   'q' to quit   |   'f' to refocus")
    print("=" * 60 + "\n")

    capture_count          = 0
    last_capture_time      = 0
    last_refocus_time      = time.time()
    current_detections     = []
    total_detections_count = 0

    try:
        while True:
            frame        = camera.capture_array()
            current_time = time.time()
            display_frame = frame.copy()

            # Auto-refocus
            if current_time - last_refocus_time >= REFOCUS_INTERVAL:
                print(f"\n🔍 Auto-refocus...")
                try:
                    camera.autofocus_cycle()
                    time.sleep(0.3)
                    print("   ✔ Done\n")
                    last_refocus_time = current_time
                except Exception as e:
                    print(f"   ⚠  {e}\n")

            # Capture & detect
            if current_time - last_capture_time >= CAPTURE_INTERVAL:
                capture_count += 1
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                temp_path = os.path.join(temp_dir, f"capture_{timestamp}.jpg")
                cv2.imwrite(temp_path, frame)

                print(f"\n📸 Capture #{capture_count}  [{timestamp}]")
                print("   ☁  Sending to API...", end=" ", flush=True)

                t0 = time.time()
                raw_detections = detector.detect_from_file(temp_path)
                api_ms = (time.time() - t0) * 1000

                if raw_detections is not None:
                    print(f"✔ ({api_ms:.0f}ms)")

                    # Attach category to each detection & send to Arduino
                    current_detections = []
                    for det in raw_detections:
                        category = get_category(det["name"])
                        if category is None:
                            print(f"      ⚠  Unknown class '{det['name']}' — add to CATEGORY_MAP to classify")
                            det["category"] = "unknown"
                        else:
                            det["category"] = category
                            char = SERIAL_CHAR[category]
                            arduino.send(char)
                            log_item(category)
                            send_servo(category)
                        current_detections.append(det)

                    if current_detections:
                        print(f"   ✅ {len(current_detections)} detection(s):")
                        for det in current_detections:
                            print(f"      • {det['name']} → {det.get('category','?').upper()} ({det['confidence']:.2f})")
                        total_detections_count += len(current_detections)
                    else:
                        print("   ℹ  No objects detected")

                else:
                    print("✗ API call failed")
                    current_detections = []

                try:
                    os.remove(temp_path)
                except:
                    pass

                last_capture_time = current_time

            # Draw overlay
            display_frame = draw_detections(display_frame, current_detections)

            time_until_next = max(0, CAPTURE_INTERVAL - (current_time - last_capture_time))
            cv2.putText(display_frame, f"Next: {time_until_next:.1f}s",   (10, 30),  cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)
            cv2.putText(display_frame, f"Captures: {capture_count}",      (10, 60),  cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)
            cv2.putText(display_frame, f"In frame: {len(current_detections)}", (10, 90), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
            cv2.putText(display_frame, f"Total: {total_detections_count}", (10, 120), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

            cv2.imshow("Cloud Detection - Plastic / Metal / Valuable", display_frame)

            key = cv2.waitKey(100) & 0xFF
            if key == ord('q'):
                print("\n🛑 Stopping...")
                break
            elif key == ord('f'):
                print("\n🔍 Manual refocus...")
                try:
                    camera.autofocus_cycle()
                    time.sleep(0.5)
                    print("   ✔ Done\n")
                except Exception as e:
                    print(f"   ⚠  {e}\n")

    except KeyboardInterrupt:
        print("\n🛑 Interrupted by user")

    finally:
        camera.stop()
        cv2.destroyAllWindows()
        arduino.close()

        print(f"\n🧹 Cleaning up temp files...")
        try:
            for file in os.listdir(temp_dir):
                os.remove(os.path.join(temp_dir, file))
            os.rmdir(temp_dir)
            print("✔ Done")
        except Exception as e:
            print(f"⚠  Cleanup: {e}")

        print(f"\n📊 Session Summary:")
        print(f"   Total captures:   {capture_count}")
        print(f"   Total detections: {total_detections_count}")
        print("✔ Bye!")


if __name__ == "__main__":
    main()