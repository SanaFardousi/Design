/*
 * egaila.ino
 * Ramool Beach Cleaning Robot — Egaila Beach
 * CpE-494: Computer System Engineering, 2025-2026
 *
 * Wiring:
 *   NEO-6M TX -> pin 4   NEO-6M RX -> pin 3
 *   Arduino USB -> Raspberry Pi (status messages over Serial)
 *
 * What this does:
 *   Reads GPS, drives a lawnmower pattern inside the zone,
 *   sends one status line to the Pi each update, returns home when done.
 *
 * Status line format sent to Pi:
 *   strip, total, coverage%, lat, lon
 *   Example:  3,8,18,29.169025,48.110206
 */

#include <SoftwareSerial.h>
#include <TinyGPSPlus.h>
#include "ramool_nav.h"

/* ------------------------------------------------------------------ *
 * BEACH SETTINGS — change only these four values for each beach      *
 * ------------------------------------------------------------------ */
#define HOME_LAT    29.1690f  /* Start/home latitude  — update with field GPS */
#define HOME_LON    48.1100f  /* Start/home longitude — update with field GPS */
#define ZONE_W_M    50.0f     /* Zone width  east-west  (metres)              */
#define ZONE_H_M    40.0f     /* Zone height north-south (metres)             */
/* ------------------------------------------------------------------ */

SoftwareSerial gpsSerial(4, 3);   /* RX=4, TX=3 */
TinyGPSPlus    gps;

/* Navigation state */
int   currentStrip  = 0;
int   totalStrips   = 0;
bool  sessionDone   = false;
float timeUsed      = 0.0f;

/* Current target the robot drives toward */
float targetLat, targetLon;

/* ------------------------------------------------------------------ */

void setup() {
    Serial.begin(9600);
    gpsSerial.begin(9600);

    /* Pre-compute how many strips fit in the time budget */
    int maxStrips = (int)(ZONE_H_M / STRIP_WIDTH_M);
    float t = 0;
    for (int i = 0; i < maxStrips; i++) {
        float stripTime = ZONE_W_M / SPEED_MS;
        float shiftTime = STRIP_WIDTH_M / SPEED_MS + 10.0f; /* 10s = 2 turns */
        float returnDist = ZONE_W_M;                         /* worst case    */
        float returnTime = returnDist / SPEED_MS;
        if (t + stripTime + shiftTime + returnTime > SESSION_S - RETURN_BUFFER_S)
            break;
        t += stripTime + shiftTime;
        totalStrips = i + 1;
    }

    /* First target: start of strip 0 (south-west corner) */
    targetLat = HOME_LAT + (0 + 0.5f) * STRIP_WIDTH_M / M_PER_DEG_LAT;
    targetLon = HOME_LON;

    Serial.println(F("Egaila Beach — waiting for GPS fix"));
}

/* ------------------------------------------------------------------ */

void loop() {
    /* Feed GPS characters to the parser */
    while (gpsSerial.available())
        gps.encode(gpsSerial.read());

    if (!gps.location.isUpdated() || !gps.location.isValid())
        return;

    float curLat = (float)gps.location.lat();
    float curLon = (float)gps.location.lng();

    /* Session already finished — just report position */
    if (sessionDone) {
        sendStatus(currentStrip, totalStrips, 100, curLat, curLon);
        delay(5000);
        return;
    }

    /* Check if arrived at current target */
    if (gpsDistance(curLat, curLon, targetLat, targetLon) <= ARRIVE_THRESH_M) {
        nextTarget(curLat, curLon);
    }

    /* Send status to Raspberry Pi */
    float coverage = 100.0f * currentStrip / (float)totalStrips;
    sendStatus(currentStrip, totalStrips, (int)coverage, curLat, curLon);
}

/* ------------------------------------------------------------------ */

/*
 * nextTarget — called when the robot arrives at a waypoint.
 *
 * Each strip has two waypoints: the far end of the current strip
 * (which we just arrived at), then the start of the next strip.
 * When out of strips, the target becomes home.
 */
void nextTarget(float curLat, float curLon) {

    timeUsed += ZONE_W_M / SPEED_MS;  /* Add time for the strip just done */
    currentStrip++;

    bool anotherStrip = (currentStrip < totalStrips);

    if (anotherStrip) {
        /* Move to start of next strip.
         * Boustrophedon: even strips start west, odd strips start east. */
        float stripLat = HOME_LAT + (currentStrip + 0.5f) * STRIP_WIDTH_M / M_PER_DEG_LAT;
        bool  goEast   = (currentStrip % 2 == 0);
        float widthDeg = ZONE_W_M / M_PER_DEG_LON;

        targetLat = stripLat;
        targetLon = goEast ? HOME_LON : HOME_LON + widthDeg;
    } else {
        /* No more strips — return home */
        targetLat  = HOME_LAT;
        targetLon  = HOME_LON;
        sessionDone = true;
    }
}

/* Send one CSV status line to the Raspberry Pi */
void sendStatus(int strip, int total, int cov, float lat, float lon) {
    Serial.print(strip);   Serial.print(',');
    Serial.print(total);   Serial.print(',');
    Serial.print(cov);     Serial.print(',');
    Serial.print(lat, 6);  Serial.print(',');
    Serial.println(lon, 6);
}
