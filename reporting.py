# ─────────────────────────────────────────────
#  Ramool – Pi Serial Handler
#  Reads chars from Arduino via USB serial
#  and forwards bin states to the backend API
#
#  Arduino char protocol:
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

# ── Bin state ─────────────────────────────────
# Matches exactly what the existing /api/bins/status endpoint expects
bins = [
    { 'id': 1, 'label': 'Plastic',  'full': False },
    { 'id': 2, 'label': 'Metal',    'full': False },
    { 'id': 3, 'label': 'Valuable', 'full': False },
    { 'id': 4, 'label': 'Other',    'full': False },
]

# ── Send full bin snapshot to backend ─────────
def send_bins():
    try:
        res = requests.post(
            f"{BASE_URL}/api/bins/status",
            json={ 'bins': bins },
            headers={ 'x-api-key': API_KEY },
            timeout=5
        )
        log.info(f"POST /api/bins/status → {res.status_code}")

    except requests.exceptions.ConnectionError:
        log.error(f"Cannot reach backend at {BASE_URL}")
    except requests.exceptions.Timeout:
        log.error("Request timed out")

# ── Helper: update a bin's full state ─────────
def set_bin_full(label, full):
    for b in bins:
        if b['label'] == label:
            b['full'] = full
            return

# ── Char handlers ─────────────────────────────
def on_metal_inserted():
    log.info("Metal trash inserted")
    # Not full yet — no state change needed

def on_metal_full():
    log.warning("Metal bin is FULL")
    set_bin_full('Metal', True)
    send_bins()

def on_plastic_inserted():
    log.info("Plastic trash inserted")
    # Not full yet — no state change needed

def on_plastic_full():
    log.warning("Plastic bin is FULL")
    set_bin_full('Plastic', True)
    send_bins()

def on_obstacle_detected():
    log.warning("Obstacle detected!")
    # No bin state change — no endpoint for this in the existing backend

def on_obstacle_cleared():
    log.info("Obstacle cleared")
    # No bin state change — no endpoint for this in the existing backend

# ── Char → handler map ────────────────────────
CHAR_HANDLERS = {
    'm': on_metal_inserted,
    'M': on_metal_full,
    'p': on_plastic_inserted,
    'P': on_plastic_full,
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

                while True:
                    if ser.in_waiting > 0:
                        raw  = ser.read(1)
                        char = raw.decode('ascii', errors='ignore').strip()

                        if char in CHAR_HANDLERS:
                            log.info(f"Char received: '{char}'")
                            CHAR_HANDLERS[char]()
                        elif char:
                            log.debug(f"Unknown char: '{char}'")

        except serial.SerialException as e:
            log.error(f"Serial error: {e}. Retrying in 5 seconds...")
            time.sleep(5)

if __name__ == '__main__':
    main()