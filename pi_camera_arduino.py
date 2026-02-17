import cv2
import json
import requests
import time
import os
import tempfile
import serial
from datetime import datetime
from picamera2 import Picamera2

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
                            # Unmapped class — log and skip serial send
                            print(f"      ⚠  Unknown class '{det['name']}' — add to CATEGORY_MAP to classify")
                            det["category"] = "unknown"
                        else:
                            det["category"] = category
                            char = SERIAL_CHAR[category]
                            arduino.send(char)
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
