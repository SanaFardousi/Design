/*
 * Beach selection 
 *  The Pi sends a SINGLE CHARACTER over Serial when a cleaning session
 *  starts (triggered by the command_poll_loop in the Pi script):
 *
 *    'F' → Fintas
 *    'E' → Egaila
 *    'S' → Salmiya
 *
 *  Status sent back to Pi 
 *  One CSV line per loop:   strip,totalStrips,coverage%,lat,lon
 *  Example:                 3,8,37,29.169025,48.110206
 *  Obstacle event:          OBS:<distance_cm>
 *  Strip advance:           STRIP:<n>
 *  Session end:             DONE
 *
 *  Wiring 
 *  NEO-6M GPS     TX → pin 4    RX → pin 3
 *  Left  stepper  STEP → pin 8  DIR → pin 9
 *  Right stepper  STEP → pin 10 DIR → pin 11
 *  ENABLE (shared)     → pin 12  (LOW = enabled)
 *  HC-SR04        TRIG → pin 5  ECHO → pin 6
 *  USB                 → Pi /dev/ttyACM1
 *
 */

#include <SoftwareSerial.h>
#include <TinyGPSPlus.h>
#include "nadhif_nav.h"

// BEACH TABLE 
struct BeachConfig {
    char  key;        /* Single char the Pi sends  */
    float homeLat;    /* Home / start latitude      */
    float homeLon;    /* Home / start longitude     */
    float zoneW;      /* Zone width  east-west  (m) */
    float zoneH;      /* Zone height north-south (m)*/
};

const BeachConfig BEACHES[] = {
    { 'F', 29.193666f, 48.115111f, 22.0f, 18.0f },  /* Fintas  */
    { 'E', 29.1690f,   48.1100f,   50.0f, 40.0f },  /* Egaila  */
    { 'S', 29.3250f,   48.0830f,   35.0f, 28.0f },  /* Salmiya */
};
const int NUM_BEACHES = sizeof(BEACHES) / sizeof(BEACHES[0]);


//RUNTIME STATE
BeachConfig beach;

int   currentStrip = 0;
int   totalStrips  = 0;
bool  sessionDone  = false;
float targetLat, targetLon;

SoftwareSerial gpsSerial(4, 3);   /* RX=4, TX=3 */
TinyGPSPlus    gps;

//BEACH SELECTION
void selectBeach() {
    while (true) {
        if (Serial.available()) {
            char c = (char)Serial.read();
            for (int i = 0; i < NUM_BEACHES; i++) {
                if (c == BEACHES[i].key) {
                    beach = BEACHES[i];
                    return;   /* beach loaded, proceed to setup */
                }
            }
            /* Any unrecognised char: ignore and keep waiting */
        }
    }
}

//STRIP COUNT: how many strips fit within the session time budget

int computeTotalStrips() {
    int   maxStrips = (int)(beach.zoneH / STRIP_WIDTH_M);
    float t         = 0;
    int   count     = 0;
    for (int i = 0; i < maxStrips; i++) {
        float stripTime  = beach.zoneW / SPEED_MS;
        float shiftTime  = STRIP_WIDTH_M / SPEED_MS + 10.0f;
        float returnTime = sqrt(beach.zoneW * beach.zoneW + beach.zoneH * beach.zoneH)
                           / SPEED_MS;
        if (t + stripTime + shiftTime + returnTime > SESSION_S - RETURN_BUFFER_S)
            break;
        t += stripTime + shiftTime;
        count = i + 1;
    }
    return count;
}

//NEXT TARGET: called when the robot arrives at the end of a strip

void nextTarget() {
    currentStrip++;

    if (currentStrip < totalStrips) {

        /* 1. Shift robot north by one strip width */
        motorsEnable();
        pivotTurn(1,  TURN_90_STEPS);               /* face north  */
        driveForward(distToSteps(STRIP_WIDTH_M));    /* move north  */
        pivotTurn(-1, TURN_90_STEPS);               /* face east   */
        motorsDisable();

        /* 2. Compute new GPS target */
        float stripLat = beach.homeLat
                         + (currentStrip + 0.5f) * STRIP_WIDTH_M / M_PER_DEG_LAT;
        float widthDeg = beach.zoneW / M_PER_DEG_LON;

        bool evenStrip = (currentStrip % 2 == 0);
        targetLat = stripLat;
        targetLon = evenStrip ? beach.homeLon + widthDeg  /* east end */
                              : beach.homeLon;             /* west end */

        /* 3. Pivot 180° to face the correct direction for this strip */
        motorsEnable();
        pivotTurn(1, TURN_90_STEPS * 2);
        motorsDisable();

        Serial.print(F("STRIP:"));
        Serial.println(currentStrip);

    } else {
        /* All strips complete, go home */
        targetLat   = beach.homeLat;
        targetLon   = beach.homeLon;
        sessionDone = true;
        Serial.println(F("RETURNING HOME"));
    }
}

//STATUS: one CSV line to the Pi each loop iteration

void sendStatus(float lat, float lon) {
    int coverage = totalStrips > 0
                   ? (int)(100.0f * currentStrip / (float)totalStrips)
                   : 0;
    Serial.print(currentStrip); Serial.print(',');
    Serial.print(totalStrips);  Serial.print(',');
    Serial.print(coverage);     Serial.print(',');
    Serial.print(lat, 6);       Serial.print(',');
    Serial.println(lon, 6);
}


//SETUP

void setup() {
    Serial.begin(9600);
    gpsSerial.begin(9600);
    navPinsSetup();

    /* Wait for the Pi to send the beach character */
    selectBeach();

    /* Compute strips and set the first waypoint */
    totalStrips = computeTotalStrips();
    targetLat   = beach.homeLat + 0.5f * STRIP_WIDTH_M / M_PER_DEG_LAT;
    targetLon   = beach.homeLon + beach.zoneW / M_PER_DEG_LON;
}

//MAIN LOOP

void loop() {

    /* Feed GPS parser */
    while (gpsSerial.available())
        gps.encode(gpsSerial.read());

    /* Wait for a valid GPS fix before moving */
    if (!gps.location.isValid())
        return;

    float curLat = (float)gps.location.lat();
    float curLon = (float)gps.location.lng();

    /* Session finished: park and keep reporting */
    if (sessionDone) {
        sendStatus(curLat, curLon);
        delay(5000);
        return;
    }

    /* 1. Obstacle check, detour if something is in the way */
    float dist = readDistanceCM();
    if (dist > 0.0f && dist < OBSTACLE_DIST_CM) {
        Serial.print(F("OBS:"));
        Serial.println(dist);
        motorsEnable();
        bypassObstacle();
        motorsDisable();
        /* Same GPS target remains active, resume toward it after detour */
    }

    /* 2. Waypoint arrival check */
    if (gpsDistance(curLat, curLon, targetLat, targetLon) <= ARRIVE_THRESH_M) {
        nextTarget();
        return;   /* re-enter loop with a fresh GPS read */
    }

    /* 3. Drive one 20 cm step toward the waypoint */
    motorsEnable();
    driveForward(distToSteps(0.2f));
    motorsDisable();

    /* 4. Send status to Pi */
    sendStatus(curLat, curLon);
}
