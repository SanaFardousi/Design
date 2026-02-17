import cv2
import json
import requests
import time
import os
import tempfile
from datetime import datetime
from picamera2 import Picamera2

class SimpleCloudDetector:
    def __init__(self, api_key, model_url, confidence=0.25, iou=0.45, api_endpoint=None):
        """
        Initialize Ultralytics Cloud API detector
        
        Args:
            api_endpoint: Optional dedicated endpoint URL
                         If None, uses shared API (rate limited)
                         If provided, uses dedicated API (higher limits)
        """
        # Use dedicated endpoint if provided, otherwise use shared API
        if api_endpoint:
            self.api_url = api_endpoint
            print(f"✓ Using DEDICATED endpoint")
        else:
            self.api_url = "https://predict.ultralytics.com"
            print(f"✓ Using SHARED endpoint (rate limited)")
        
        self.api_key = api_key
        self.model_url = model_url
        self.confidence = confidence
        self.iou = iou
        
        print(f"  Endpoint: {self.api_url}")
        print(f"  Model: {model_url}")
        print(f"  Confidence: {confidence}")
    
    def detect_from_file(self, image_path):
        """Run detection on an image file"""
        try:
            headers = {"x-api-key": self.api_key}
            
            # For dedicated endpoint, don't include model URL in data
            # Dedicated endpoints have the model pre-configured
            if "predict.ultralytics.com" != self.api_url:
                # Dedicated endpoint (Cloud Run URL) - no model URL needed
                data = {
                    "imgsz": 640,
                    "conf": self.confidence,
                    "iou": self.iou
                }
            else:
                # Shared endpoint - need model URL
                data = {
                    "model": self.model_url,
                    "imgsz": 640,
                    "conf": self.confidence,
                    "iou": self.iou
                }
            
            with open(image_path, "rb") as f:
                files = {"file": f}
                response = requests.post(
                    self.api_url,
                    headers=headers,
                    data=data,
                    files=files,
                    timeout=10
                )
            
            response.raise_for_status()
            result = response.json()
            
            # Parse response
            detections = []
            if "images" in result and len(result["images"]) > 0:
                if "results" in result["images"][0]:
                    for det in result["images"][0]["results"]:
                        box = det["box"]
                        detections.append({
                            "class": det["class"],
                            "name": det["name"],
                            "confidence": det["confidence"],
                            "box": [
                                int(box["x1"]), int(box["y1"]),
                                int(box["x2"]), int(box["y2"])
                            ]
                        })
            
            return detections
            
        except requests.exceptions.RequestException as e:
            print(f"❌ API Error: {e}")
            return None
        except Exception as e:
            print(f"❌ Error: {e}")
            return None

def draw_detections(image, detections):
    """Draw bounding boxes on image"""
    if not detections:
        return image
    
    for det in detections:
        x1, y1, x2, y2 = det["box"]
        name = det["name"]
        conf = det["confidence"]
        
        # Draw box
        cv2.rectangle(image, (x1, y1), (x2, y2), (0, 255, 0), 2)
        
        # Draw label
        label = f"{name}: {conf:.2f}"
        (w, h), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
        cv2.rectangle(image, (x1, y1 - h - 10), (x1 + w, y1), (0, 255, 0), -1)
        cv2.putText(image, label, (x1, y1 - 5),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 2)
    
    return image

def main():
    # ========================================
    # CONFIGURATION
    # ========================================
    API_KEY = "b42e02b5a56c145f6ae7513aae888cdf9f570fa970"
    MODEL_URL = "https://hub.ultralytics.com/models/g6ukybMzSi9dDpghhDTY"
    CONFIDENCE = 0.25
    IOU = 0.45
    CAPTURE_INTERVAL = 2  # Seconds between captures
    
    # ⚡ DEDICATED ENDPOINT CONFIGURATION ⚡
    # Your friend's dedicated endpoint (europe-west4)
    # This is your ACTUAL endpoint URL - already configured!
    DEDICATED_ENDPOINT = "https://predict-f8mbbq9g6kiwnrd4umec-7nza6zqsha-ez.a.run.app"
    
    # Initialize Pi Camera with RGB888 (NO conversion needed!)
    print("🎥 Initializing Pi Camera Module 3...")
    camera = Picamera2()
    
    # Configure camera with proper autofocus settings
    config = camera.create_still_configuration(
        main={"size": (640, 480), "format": "RGB888"},
        controls={
            "AfMode": 2,  # Continuous autofocus
            "AfSpeed": 1,  # Fast autofocus
            "AwbEnable": True,  # Auto white balance
            "AeEnable": True,  # Auto exposure
        }
    )
    
    camera.configure(config)
    camera.start()
    
    print("⏳ Waiting for camera to warm up and autofocus...")
    time.sleep(3)  # Give time for autofocus
    
    # Trigger initial autofocus
    print("🔍 Triggering autofocus...")
    try:
        camera.autofocus_cycle()
        time.sleep(1)
        print("✓ Autofocus complete")
    except Exception as e:
        print(f"⚠️  Autofocus: {e}")
    
    # Initialize detector
    print("☁️  Initializing Ultralytics Cloud API...")
    detector = SimpleCloudDetector(
        API_KEY, 
        MODEL_URL, 
        CONFIDENCE, 
        IOU,
        api_endpoint=DEDICATED_ENDPOINT
    )
    
    # Create temp directory for images
    temp_dir = tempfile.mkdtemp(prefix="detection_")
    print(f"📁 Temp directory: {temp_dir}")
    
    print("\n" + "="*60)
    print("🚀 DETECTION STARTED")
    print("="*60)
    print(f"⏱️  Capturing every {CAPTURE_INTERVAL} seconds")
    print(f"🔍 Auto-refocus every 10 seconds")
    if DEDICATED_ENDPOINT:
        print(f"⚡ Using DEDICATED endpoint (no rate limits!)")
        print(f"   Endpoint: {DEDICATED_ENDPOINT[:50]}...")
    else:
        print(f"⚠️  Using shared endpoint (rate limited)")
        print(f"   May hit 429 errors after ~60 requests")
    print("="*60 + "\n")
    
    capture_count = 0
    last_capture_time = 0
    current_detections = []
    total_detections_count = 0
    last_refocus_time = time.time()
    refocus_interval = 20
    
    try:
        while True:
            # Capture frame in RGB888 format
            # NO CONVERSION NEEDED - colors are already correct!
            frame = camera.capture_array()
            
            current_time = time.time()
            display_frame = frame.copy()
            
            # Auto-refocus every 10 seconds
            if current_time - last_refocus_time >= refocus_interval:
                print(f"\n🔍 Auto-refocus (every {refocus_interval}s)...")
                try:
                    camera.autofocus_cycle()
                    time.sleep(0.3)
                    print("   ✓ Refocus complete\n")
                    last_refocus_time = current_time
                except Exception as e:
                    print(f"   ⚠️  {e}\n")
            
            # Check if it's time to capture and detect
            if current_time - last_capture_time >= CAPTURE_INTERVAL:
                capture_count += 1
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                temp_image_path = os.path.join(temp_dir, f"capture_{timestamp}.jpg")
                
                # Save frame temporarily (RGB format - cv2.imwrite handles it correctly)
                cv2.imwrite(temp_image_path, frame)
                print(f"\n📸 Capture #{capture_count} - {timestamp}")
                
                # Run detection
                print("   ☁️  Sending to API...", end=" ", flush=True)
                start_time = time.time()
                detections = detector.detect_from_file(temp_image_path)
                api_time = (time.time() - start_time) * 1000
                
                if detections is not None:
                    print(f"✓ ({api_time:.0f}ms)")
                    
                    if len(detections) > 0:
                        print(f"   ✅ Detected {len(detections)} objects:")
                        for det in detections:
                            print(f"      • {det['name']}: {det['confidence']:.2f}")
                        current_detections = detections
                        total_detections_count += len(detections)
                    else:
                        print("   ℹ️  No objects detected")
                        current_detections = []
                else:
                    print("❌ API call failed")
                
                # Delete temp image immediately
                try:
                    os.remove(temp_image_path)
                except:
                    pass
                
                last_capture_time = current_time
            
            # Draw current detections on display frame
            display_frame = draw_detections(display_frame, current_detections)
            
            # Add info overlay
            time_until_next = max(0, CAPTURE_INTERVAL - (current_time - last_capture_time))
            cv2.putText(display_frame, f"Next: {time_until_next:.1f}s", (10, 30),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)
            cv2.putText(display_frame, f"Captures: {capture_count}", (10, 60),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)
            cv2.putText(display_frame, f"Detected: {len(current_detections)}", (10, 90),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
            cv2.putText(display_frame, f"Total: {total_detections_count}", (10, 120),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
            
            # Show frame
            cv2.imshow("Cloud Detection", display_frame)
            
            # Handle key presses
            key = cv2.waitKey(100) & 0xFF
            if key == ord('q'):
                print("\n🛑 Stopping...")
                break
            elif key == ord('f'):
                print("\n🔍 Manual refocus...")
                try:
                    camera.autofocus_cycle()
                    time.sleep(0.5)
                    print("   ✓ Complete\n")
                except Exception as e:
                    print(f"   ⚠️  {e}\n")
    
    except KeyboardInterrupt:
        print("\n🛑 Interrupted by user")
    
    finally:
        # Cleanup
        camera.stop()
        cv2.destroyAllWindows()
        
        # Delete all temp files and directory
        print(f"\n🧹 Cleaning up temp files...")
        try:
            for file in os.listdir(temp_dir):
                os.remove(os.path.join(temp_dir, file))
            os.rmdir(temp_dir)
            print("✓ Temp files deleted")
        except Exception as e:
            print(f"⚠️  Cleanup warning: {e}")
        
        print(f"\n📊 Session Summary:")
        print(f"   Total captures: {capture_count}")
        print(f"   Total detections: {total_detections_count}")
        print("✓ Done!")

if __name__ == "__main__":
    main()
