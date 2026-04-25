/*
 * nadhif_nav.h
 *
 * Shared constants, pin definitions, motor helpers, and obstacle-avoidance
 * logic used by all three beach sketches.
 *
 * Hardware assumed:
 *   - 2× stepper motors (one per wheel) driven by A4988 / DRV8825 drivers
 *   - HC-SR04 ultrasonic sensor for obstacle detection
 *   - NEO-6M GPS module
 */

#ifndef NADHIF_NAV_H
#define NADHIF_NAV_H

#include <math.h>

//Robot physical constants 
#define SPEED_MS          0.3f    /* Forward speed on sand (m/s)         */
#define STRIP_WIDTH_M     0.5f    /* Cleaning-tray sift width (m)        */
#define ARRIVE_THRESH_M   3.0f    /* "Arrived" radius at a waypoint (m)  */
#define RETURN_BUFFER_S   180.0f  /* Seconds reserved for return trip    */
#define SESSION_S         1800.0f /* 30-minute session                   */

//GPS unit conversion at Kuwait latitude (~29 N) 
#define M_PER_DEG_LAT     111000.0f
#define M_PER_DEG_LON      97000.0f

//Stepper motor pins (A4988/DRV8825 wiring)
/*    Left wheel driver                                                */
#define LEFT_STEP_PIN     8
#define LEFT_DIR_PIN      9
/*    Right wheel driver                                               */
#define RIGHT_STEP_PIN    10
#define RIGHT_DIR_PIN     11
/*    Both drivers share one ENABLE line (LOW = enabled)              */
#define MOTORS_ENABLE_PIN 12

//Stepper parameters 
/*  Tune STEPS_PER_REV and WHEEL_CIRCUMFERENCE_M to match the robot. */
#define STEPS_PER_REV       200        /* Full-step mode, 1.8° stepper */
#define WHEEL_CIRCUMFERENCE_M 0.314f   /* π x 0.10 m diameter wheel   */
#define STEP_DELAY_US       800        /* µs between pulses — controls speed */

//Steps needed to travel a given distance
inline long distToSteps(float metres) {
    return (long)(metres / WHEEL_CIRCUMFERENCE_M * STEPS_PER_REV);
}

//Ultrasonic sensor pins 
#define TRIG_PIN  5
#define ECHO_PIN  6
#define OBSTACLE_DIST_CM  40.0f   /* Obstacle threshold (cm)           */

/* Fixed obstacle-bypass geometry 
 *  When an obstacle is detected the robot executes a fixed U-detour:
 *  1. Turn 90° right
 *  2. Drive BYPASS_SIDE_M forward
 *  3. Turn 90° left
 *  4. Drive BYPASS_FWD_M (clears the fixed-size object)
 *  5. Turn 90° left
 *  6. Drive BYPASS_SIDE_M forward
 *  7. Turn 90° right  →  back on original heading
 */
#define BYPASS_SIDE_M   0.6f   /* Distance to step sideways (m) */
#define BYPASS_FWD_M    0.8f   /* Distance to clear the object  (m) */

//Turn geometry 
/*  TRACK_WIDTH_M = distance between the two wheel contact patches.   */
#define TRACK_WIDTH_M   0.30f
/* Steps for one wheel to spin in place for a 90-degree turn          */
#define TURN_90_STEPS   (long)(( (3.14159f / 2.0f) * TRACK_WIDTH_M / 2.0f ) \
                                / WHEEL_CIRCUMFERENCE_M * STEPS_PER_REV)

// Motor helpers 

// Enable / disable both drivers 
inline void motorsEnable()  { digitalWrite(MOTORS_ENABLE_PIN, LOW);  }
inline void motorsDisable() { digitalWrite(MOTORS_ENABLE_PIN, HIGH); }

// Pulse one STEP pin once 
inline void stepPulse(uint8_t stepPin) {
    digitalWrite(stepPin, HIGH);
    delayMicroseconds(STEP_DELAY_US);
    digitalWrite(stepPin, LOW);
    delayMicroseconds(STEP_DELAY_US);
}

// Drive both motors forward for `steps` steps 
inline void driveForward(long steps) {
    digitalWrite(LEFT_DIR_PIN,  HIGH);   /* forward direction */
    digitalWrite(RIGHT_DIR_PIN, HIGH);
    for (long i = 0; i < steps; i++) {
        stepPulse(LEFT_STEP_PIN);
        stepPulse(RIGHT_STEP_PIN);
    }
}

/* Pivot turn in place.  dir=1 → turn right,  dir=-1 → turn left.
 * Right turn: left wheel forward, right wheel backward (and vice-versa). */
inline void pivotTurn(int dir, long steps) {
    /* dir=1 (right): left=forward, right=backward */
    digitalWrite(LEFT_DIR_PIN,  dir == 1 ? HIGH : LOW);
    digitalWrite(RIGHT_DIR_PIN, dir == 1 ? LOW  : HIGH);
    for (long i = 0; i < steps; i++) {
        stepPulse(LEFT_STEP_PIN);
        stepPulse(RIGHT_STEP_PIN);
    }
}

//Ultrasonic range reading  
inline float readDistanceCM() {
    digitalWrite(TRIG_PIN, LOW);
    delayMicroseconds(2);
    digitalWrite(TRIG_PIN, HIGH);
    delayMicroseconds(10);
    digitalWrite(TRIG_PIN, LOW);
    long duration = pulseIn(ECHO_PIN, HIGH, 30000UL); /* 30 ms timeout */
    return duration * 0.0343f / 2.0f;                 /* cm            */
}

// Obstacle avoidance (blocking) 
/*  Call this when the sensor detects something within OBSTACLE_DIST_CM.
 *  The robot performs the fixed U-detour described above, then returns
 *  so normal GPS-guided navigation can resume toward the same target.  */
inline void bypassObstacle() {
    long sideSteps = distToSteps(BYPASS_SIDE_M);
    long fwdSteps  = distToSteps(BYPASS_FWD_M);

    pivotTurn(1, TURN_90_STEPS);   /* 1. turn right            */
    driveForward(sideSteps);        /* 2. move sideways         */
    pivotTurn(-1, TURN_90_STEPS);  /* 3. turn left (forward)   */
    driveForward(fwdSteps);         /* 4. clear the object      */
    pivotTurn(-1, TURN_90_STEPS);  /* 5. turn left             */
    driveForward(sideSteps);        /* 6. move back to original lane */
    pivotTurn(1, TURN_90_STEPS);   /* 7. turn right (resume heading) */
}

// GPS distance helper 
inline float gpsDistance(float lat1, float lon1, float lat2, float lon2) {
    float dLat = (lat2 - lat1) * M_PER_DEG_LAT;
    float dLon = (lon2 - lon1) * M_PER_DEG_LON;
    return sqrt(dLat * dLat + dLon * dLon);
}

// Pin setup helper 
inline void navPinsSetup() {
    pinMode(LEFT_STEP_PIN,    OUTPUT);
    pinMode(LEFT_DIR_PIN,     OUTPUT);
    pinMode(RIGHT_STEP_PIN,   OUTPUT);
    pinMode(RIGHT_DIR_PIN,    OUTPUT);
    pinMode(MOTORS_ENABLE_PIN,OUTPUT);
    pinMode(TRIG_PIN,         OUTPUT);
    pinMode(ECHO_PIN,         INPUT);
    motorsDisable();   /* keep motors off until GPS fix acquired */
}

#endif /* NADHIF_NAV_H */
