# ─────────────────────────────────────────────
#  Ramool – Pi Serial Handler
#
#  Flow:
#   Arduino sends GPS once → Pi stores it
#   Arduino detects item   → Pi logs to DB with GPS
#   Arduino detects obstacle → Pi logs to notifications table
#
#  Serial protocol from Arduino:
#   'G:lat,lng\n' – GPS fix (sent once at startup)
#   'm' – metal trash inserted
#   'M' – metal bin full
#   'p' – plastic trash inserted
#   'P' – plastic bin full
#   'O' – obstacle detected
#   'C' – obstacle cleared
# ─────────────────────────────────────────────

import serial
import requests
import time
import logging

# ── Config ────────────────────────────────────
SERIAL_PORT = '/dev/ttyACM0'
BAUD_RATE   = 9600

BASE_URL = 'https://implacental-evelina-atmosphereless.ngrok-free.dev'
API_KEY  = 'test123'

# ─────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s'
)
log = logging.getLogger(__name__)

# ── GPS stored in memory ──────────────────────
current_lat = None
current_lng = None

# ── Bin state ─────────────────────────────────
bins = [
    { 'id': 1, 'label': 'Plastic',  'full': False },
    { 'id': 2, 'label': 'Metal',    'full': False },
    { 'id': 3, 'label': 'Valuable', 'full': False },
    { 'id': 4, 'label': 'Other',    'full': False },
]

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
        coords = line[2:]               # strip "G:"
        lat, lng = coords.split(',')
        current_lat = float(lat.strip())
        current_lng = float(lng.strip())
        log.info(f"GPS stored: {current_lat}, {current_lng}")

    except Exception as e:
        log.error(f"Failed to parse GPS line '{line}': {e}")

# ── Char handlers ─────────────────────────────
def on_metal_inserted():
    log.info("Metal trash inserted")
    log_item('metal')

def on_metal_full():
    log.warning("Metal bin is FULL")
    set_bin_full('Metal', True)
    send_bins()

def on_plastic_inserted():
    log.info("Plastic trash inserted")
    log_item('plastic')

def on_plastic_full():
    log.warning("Plastic bin is FULL")
    set_bin_full('Plastic', True)
    send_bins()

def on_general_inserted():
    log.info("General trash inserted")
    log_item('general')

def on_general_bin_full():
    log.warning("General bin is FULL")
    set_bin_full('Other', True)
    send_bins()

def on_valuable_inserted():
    log.info("Valuable item detected!")
    log_item('valuable')

def on_valuable_bin_full():
    log.warning("Valuable bin is FULL")
    set_bin_full('Valuable', True)
    send_bins()

def on_obstacle_detected():
    log.warning("Obstacle detected!")
    post('/api/robot/obstacle/detected', {})

def on_obstacle_cleared():
    log.info("Obstacle cleared")
    post('/api/robot/obstacle/cleared', {})

# ── Char → handler map ────────────────────────
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

# ── Main loop ─────────────────────────────────
def main():
    log.info(f"Connecting to Arduino on {SERIAL_PORT} at {BAUD_RATE} baud...")

    while True:
        try:
            with serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=1) as ser:
                log.info("Serial connection established. Listening...")

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
            log.error(f"Serial error: {e}. Retrying in 5 seconds...")
            time.sleep(5)

if __name__ == '__main__':
    main()