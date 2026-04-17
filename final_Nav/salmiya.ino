/*
 * salmiya.ino
 * Ramool Beach Cleaning Robot — Salmiya Beach
 * CpE-494: Computer System Engineering, 2025-2026
 *
 * Identical to egaila.ino — only the four beach settings differ.
 * See egaila.ino for full wiring and usage notes.
 */

#include <SoftwareSerial.h>
#include <TinyGPSPlus.h>
#include "ramool_nav.h"

/* ------------------------------------------------------------------ *
 * BEACH SETTINGS                                                      *
 * ------------------------------------------------------------------ */
#define HOME_LAT    29.3250f  /* Update with field GPS */
#define HOME_LON    48.0830f  /* Update with field GPS */
#define ZONE_W_M    35.0f
#define ZONE_H_M    28.0f
/* ------------------------------------------------------------------ */

SoftwareSerial gpsSerial(4, 3);
TinyGPSPlus    gps;

int   currentStrip  = 0;
int   totalStrips   = 0;
bool  sessionDone   = false;
float timeUsed      = 0.0f;
float targetLat, targetLon;

void setup() {
    Serial.begin(9600);
    gpsSerial.begin(9600);

    int maxStrips = (int)(ZONE_H_M / STRIP_WIDTH_M);
    float t = 0;
    for (int i = 0; i < maxStrips; i++) {
        float stripTime  = ZONE_W_M / SPEED_MS;
        float shiftTime  = STRIP_WIDTH_M / SPEED_MS + 10.0f;
        float returnTime = ZONE_W_M / SPEED_MS;
        if (t + stripTime + shiftTime + returnTime > SESSION_S - RETURN_BUFFER_S)
            break;
        t += stripTime + shiftTime;
        totalStrips = i + 1;
    }

    targetLat = HOME_LAT + 0.5f * STRIP_WIDTH_M / M_PER_DEG_LAT;
    targetLon = HOME_LON;

    Serial.println(F("Salmiya Beach — waiting for GPS fix"));
}

void loop() {
    while (gpsSerial.available())
        gps.encode(gpsSerial.read());

    if (!gps.location.isUpdated() || !gps.location.isValid())
        return;

    float curLat = (float)gps.location.lat();
    float curLon = (float)gps.location.lng();

    if (sessionDone) {
        sendStatus(currentStrip, totalStrips, 100, curLat, curLon);
        delay(5000);
        return;
    }

    if (gpsDistance(curLat, curLon, targetLat, targetLon) <= ARRIVE_THRESH_M)
        nextTarget(curLat, curLon);

    float coverage = 100.0f * currentStrip / (float)totalStrips;
    sendStatus(currentStrip, totalStrips, (int)coverage, curLat, curLon);
}

void nextTarget(float curLat, float curLon) {
    timeUsed += ZONE_W_M / SPEED_MS;
    currentStrip++;

    if (currentStrip < totalStrips) {
        float stripLat = HOME_LAT + (currentStrip + 0.5f) * STRIP_WIDTH_M / M_PER_DEG_LAT;
        bool  goEast   = (currentStrip % 2 == 0);
        float widthDeg = ZONE_W_M / M_PER_DEG_LON;
        targetLat = stripLat;
        targetLon = goEast ? HOME_LON : HOME_LON + widthDeg;
    } else {
        targetLat   = HOME_LAT;
        targetLon   = HOME_LON;
        sessionDone = true;
    }
}

void sendStatus(int strip, int total, int cov, float lat, float lon) {
    Serial.print(strip);   Serial.print(',');
    Serial.print(total);   Serial.print(',');
    Serial.print(cov);     Serial.print(',');
    Serial.print(lat, 6);  Serial.print(',');
    Serial.println(lon, 6);
}
