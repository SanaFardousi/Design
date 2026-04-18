/*
 *
 *  How it works 
 *  1. Arduino powers on and waits for the Raspberry Pi to send a beach
 *     selection command over Serial (USB).
 *  2. Pi sends one of:   BEACH:EGAILA
 *                        BEACH:SALMIYA
 *                        BEACH:KUWAITCITY
 *  3. Arduino confirms, loads that beach's GPS coordinates and zone
 *     size, then begins the snake (boustrophedon) cleaning pattern.
 *  4. Every loop the Arduino:
 *       a. Checks the ultrasonic sensor — detours if obstacle found.
 *       b. Drives 20 cm forward toward the current GPS waypoint.
 *       c. Checks GPS — advances to the next waypoint if arrived.
 *       d. Sends one status CSV line back to the Pi.
 *  5. When all strips are done the robot returns to the home position
 *     and reports 100% coverage.
 *
 *  Wiring 
 *  NEO-6M GPS   TX → pin 4   RX → pin 3
 *  Left  stepper  STEP → pin 8   DIR → pin 9
 *  Right stepper  STEP → pin 10  DIR → pin 11
 *  Both drivers   ENABLE (shared) → pin 12   (LOW = enabled)
 *  HC-SR04        TRIG → pin 5   ECHO → pin 6
 *  Arduino USB    → Raspberry Pi
 *
 *  Status line format sent to Pi 
 *  strip, totalStrips, coverage%, latitude, longitude
 *  Example:  3,8,37,29.169025,48.110206
 *
 */

#include <SoftwareSerial.h>
#include <TinyGPSPlus.h>
#include "nadhif_nav.h"

/* 
 * BEACH CONFIGURATION TABLE
 * To add a new beach: add one line to this array and nothing else.
*/
struct BeachConfig {
    const char* name;     /* Matches the token after "BEACH:" from Pi */
    float homeLat;        /* Starting / home latitude                 */
    float homeLon;        /* Starting / home longitude                */
    float zoneW;          /* Zone width  east-west  (metres)          */
    float zoneH;          /* Zone height north-south (metres)         */
};

const BeachConfig BEACHES[] = {
    { "EGAILA",     29.1690f, 48.1100f, 50.0f, 40.0f },
    { "SALMIYA",    29.3250f, 48.0830f, 35.0f, 28.0f },
    { "KUWAITCITY", 29.3790f, 47.9880f, 22.0f, 18.0f },
};
const int NUM_BEACHES = sizeof(BEACHES) / sizeof(BEACHES[0]);

// RUNTIME STATE  (set once after beach is selected)

BeachConfig beach;      

int   currentStrip = 0;
int   totalStrips  = 0;
bool  sessionDone  = false;
float targetLat, targetLon;

SoftwareSerial gpsSerial(4, 3);
TinyGPSPlus    gps;

// BEACH SELECTION: waits for Pi command, returns true when done
bool selectBeach() {
    Serial.println(F("READY — send BEACH:<name>"));
    Serial.println(F("Options: EGAILA  SALMIYA  KUWAITCITY"));

    String line = "";
    while (true) {
        /* Build a line from incoming Serial characters */
        while (Serial.available()) {
            char c = (char)Serial.read();
            if (c == '\n' || c == '\r') {
                line.trim();
                if (line.startsWith("BEACH:")) {
                    String name = line.substring(6);  /* text after "BEACH:" */
                    name.toUpperCase();

                    /* Search the beach table */
                    for (int i = 0; i < NUM_BEACHES; i++) {
                        if (name == BEACHES[i].name) {
                            beach = BEACHES[i];       /* copy config */
                            Serial.print(F("OK:"));
                            Serial.println(beach.name);
                            return true;
                        }
                    }
                    /* Name not found */
                    Serial.print(F("ERR:Unknown beach: "));
                    Serial.println(name);
                }
                line = "";
            } else {
                line += c;
            }
        }
    }
}

//STRIP COUNT: how many strips fit within the time budget
int computeTotalStrips() {
    int maxStrips = (int)(beach.zoneH / STRIP_WIDTH_M);
    float t = 0;
    int count = 0;
    for (int i = 0; i < maxStrips; i++) {
        float stripTime  = beach.zoneW / SPEED_MS;
        float shiftTime  = STRIP_WIDTH_M / SPEED_MS + 10.0f;  /* +10 s for turns */
        /* Worst-case return distance: diagonal across the zone */
        float returnTime = sqrt(beach.zoneW * beach.zoneW + beach.zoneH * beach.zoneH)
                           / SPEED_MS;
        if (t + stripTime + shiftTime + returnTime > SESSION_S - RETURN_BUFFER_S)
            break;
        t += stripTime + shiftTime;
        count = i + 1;
    }
    return count;
}

/* 
 * NEXT TARGET: advance waypoint at the end of each strip
 *
 * Snake pattern:
 *
 *   strip 2  W ←←←←←←←←← E   odd strips: start east, drive west
 *   strip 1  W →→→→→→→→→ E   even strips: start west, drive east
 *   strip 0  W →→→→→→→→→ E
 *   HOME ●
 *
 * When the robot arrives at the far end of a strip this function:
 *   1. Physically shifts the robot north one strip width.
 *   2. Pivots 180° to face the new direction.
 *   3. Updates targetLat / targetLon to the far end of the new strip.
 */
void nextTarget() {
    currentStrip++;

    if (currentStrip < totalStrips) {
        /*  Lateral shift: drive north one strip width  */
        motorsEnable();
        pivotTurn(1, TURN_90_STEPS);              /* face north  */
        driveForward(distToSteps(STRIP_WIDTH_M)); /* move north  */
        pivotTurn(-1, TURN_90_STEPS);             /* face east again (will be corrected below) */
        motorsDisable();

        /*  Compute new waypoint  */
        float stripLat = beach.homeLat + (currentStrip + 0.5f) * STRIP_WIDTH_M / M_PER_DEG_LAT;
        float widthDeg = beach.zoneW / M_PER_DEG_LON;

        /* Even strip → start west (HOME_LON), drive east → target is east end.
           Odd  strip → start east (HOME_LON + width), drive west → target is west end. */
        bool evenStrip = (currentStrip % 2 == 0);
        targetLat = stripLat;
        targetLon  = evenStrip ? beach.homeLon + widthDeg   /* east end  */
                               : beach.homeLon;              /* west end  */

        /*  180° pivot to face the correct direction  */
        motorsEnable();
        pivotTurn(1, TURN_90_STEPS * 2);
        motorsDisable();

        Serial.print(F("STRIP:"));
        Serial.println(currentStrip);

    } else {
        /* All strips done, return home */
        targetLat   = beach.homeLat;
        targetLon   = beach.homeLon;
        sessionDone = true;
        Serial.println(F("RETURNING HOME"));
    }
}

//STATUS: send one CSV line to Raspberry Pi

void sendStatus(float lat, float lon) {
    int coverage = (int)(100.0f * currentStrip / (float)totalStrips);
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

    /* Step 1: get beach selection from Pi */
    selectBeach();

    /* Step 2: compute how many strips we can cover */
    totalStrips = computeTotalStrips();

    /* Step 3: set first waypoint, far (east) end of strip 0 */
    targetLat = beach.homeLat + 0.5f * STRIP_WIDTH_M / M_PER_DEG_LAT;
    targetLon = beach.homeLon + beach.zoneW / M_PER_DEG_LON;

    Serial.print(F("START:"));
    Serial.print(beach.name);
    Serial.print(F(" strips="));
    Serial.println(totalStrips);

    Serial.println(F("Waiting for GPS fix..."));
}

// MAIN LOOP

void loop() {
    /*  Feed GPS parser  */
    while (gpsSerial.available())
        gps.encode(gpsSerial.read());

    /* Wait until we have a valid GPS fix before doing anything */
    if (!gps.location.isValid())
        return;

    float curLat = (float)gps.location.lat();
    float curLon = (float)gps.location.lng();

    /*  Session finished: sit at home and report  */
    if (sessionDone) {
        sendStatus(curLat, curLon);
        delay(5000);
        return;
    }

    /*  1. Obstacle check (before moving)  */
    float dist = readDistanceCM();
    if (dist > 0.0f && dist < OBSTACLE_DIST_CM) {
        Serial.print(F("OBS:"));
        Serial.println(dist);
        motorsEnable();
        bypassObstacle();
        motorsDisable();
        /* After the detour the robot is back on its original heading.
           The same GPS target is still active, continue toward it. */
    }

    /*  2. Arrived at waypoint?  */
    if (gpsDistance(curLat, curLon, targetLat, targetLon) <= ARRIVE_THRESH_M) {
        nextTarget();   /* shift, pivot, set new target */
        return;         /* re-enter loop with fresh GPS read */
    }

    /*  3. Drive forward one small step toward the waypoint  */
    motorsEnable();
    driveForward(distToSteps(0.2f));   /* 20 cm, then re-check GPS + obstacle */
    motorsDisable();

    /*  4. Report status to Pi  */
    sendStatus(curLat, curLon);
}
