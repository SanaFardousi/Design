#include <Arduino.h>
#include <Servo.h>

// Motor A Pins (main conveyor - always on)
#define ENA 5
#define IN1 2
#define IN2 3

// Motor B Pins (feeder - timed)
#define ENB 6
#define IN3 4
#define IN4 7

// Servo pins
#define SERVO_PIN  5
#define SERVO_PIN2 4
#define SERVO_PIN3 3
#define SERVO_PIN4 2

// Ultrasonic bin sensors
#define TRIG1 13
#define ECHO1 12
#define TRIG2 10
#define ECHO2 11
#define TRIG3 8
#define ECHO3 9
#define TRIG4 7
#define ECHO4 6

// Obstacle sensor
#define TRIG_OBS 17
#define ECHO_OBS 16

// ── Config ───────────────────────────────────────────────
#define ANGLE_HOME     180
#define ANGLE_PLASTIC   60
#define ANGLE_METAL     40
#define ANGLE_VALUABLE  20
#define ANGLE_DEFAULT    10   // last servo has no special angle, just pushes
#define PUSH_HOLD_MS   3000

#define BIN_FULL_DISTANCE  7      // cm
#define BIN_FULL_TIME      10000  // 10 seconds

// ── Servos ───────────────────────────────────────────────
Servo servo1, servo2, servo3, servo4;

enum ServoState { IDLE, PUSHING, RETURNING };

struct ServoChannel {
  Servo*     srv;
  int        pushAngle;
  int        homeAngle;
  ServoState state;
  unsigned long stateMillis;
};

ServoChannel channels[4];

void triggerServo(int ch) {
  if (channels[ch].state != IDLE) return;
  channels[ch].srv->write(channels[ch].pushAngle);
  channels[ch].state       = PUSHING;
  channels[ch].stateMillis = millis();
}

void updateServos(unsigned long now) {
  for (int i = 0; i < 4; i++) {
    ServoChannel &c = channels[i];
    if (c.state == PUSHING && now - c.stateMillis >= PUSH_HOLD_MS) {
      c.srv->write(c.homeAngle);
      c.state       = RETURNING;
      c.stateMillis = now;
    } else if (c.state == RETURNING && now - c.stateMillis >= PUSH_HOLD_MS) {
      c.state = IDLE;
    }
  }
}

// ── Bin full tracking ────────────────────────────────────
unsigned long binFullStart[4] = {0, 0, 0, 0};
bool          binTiming[4]    = {false, false, false, false};
bool          binFullSent[4]  = {false, false, false, false};

int trigPins[4] = {TRIG1, TRIG2, TRIG3, TRIG4};
int echoPins[4] = {ECHO1, ECHO2, ECHO3, ECHO4};

float readDistance(int trigPin, int echoPin) {
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);
  long duration = pulseIn(echoPin, HIGH, 30000);
  if (duration == 0) return 999.0;
  return duration * 0.034 / 2.0;
}

void updateBinSensors(unsigned long now) {
  for (int i = 0; i < 4; i++) {
    float dist = readDistance(trigPins[i], echoPins[i]);
    bool  near = (dist > 0 && dist <= BIN_FULL_DISTANCE);

    if (near) {
      if (!binTiming[i]) {
        binFullStart[i] = now;
        binTiming[i]    = true;
        binFullSent[i]  = false;
      } else if (!binFullSent[i] && (now - binFullStart[i] >= BIN_FULL_TIME)) {
        Serial.print("FULL_");
        Serial.println(i + 1);
        binFullSent[i] = true;
      }
    } else {
      binTiming[i]   = false;
      binFullSent[i] = false;
    }
  }
}

// ── Motor B (feeder) ─────────────────────────────────────
unsigned long motorBMillis = 0;
bool motorBRunning = true;

void updateMotorB(unsigned long now) {
  if (motorBRunning && now - motorBMillis >= 3000) {
    analogWrite(ENB, 0);
    motorBRunning = false;
    motorBMillis  = now;
  } else if (!motorBRunning && now - motorBMillis >= 3000) {
    analogWrite(ENB, 255);
    motorBRunning = true;
    motorBMillis  = now;
  }
}

// ── Setup ────────────────────────────────────────────────
void setup() {
  Serial.begin(9600);

  // Motors
  pinMode(ENA, OUTPUT); pinMode(IN1, OUTPUT); pinMode(IN2, OUTPUT);
  pinMode(ENB, OUTPUT); pinMode(IN3, OUTPUT); pinMode(IN4, OUTPUT);
  digitalWrite(IN1, HIGH); digitalWrite(IN2, LOW); analogWrite(ENA, 150);
  digitalWrite(IN3, HIGH); digitalWrite(IN4, LOW); analogWrite(ENB, 150);

  // Ultrasonic pins
  for (int i = 0; i < 4; i++) {
    pinMode(trigPins[i], OUTPUT);
    pinMode(echoPins[i], INPUT);
  }
  pinMode(TRIG_OBS, OUTPUT);
  pinMode(ECHO_OBS, INPUT);

  // Servos
  servo1.attach(SERVO_PIN);
  servo2.attach(SERVO_PIN2);
  servo3.attach(SERVO_PIN3);
  servo4.attach(SERVO_PIN4);

  channels[0] = { &servo1, ANGLE_PLASTIC,  ANGLE_HOME, IDLE, 0 };  // P → Plastic
  channels[1] = { &servo2, ANGLE_METAL,    ANGLE_HOME, IDLE, 0 };  // M → Metal
  channels[2] = { &servo3, ANGLE_VALUABLE, ANGLE_HOME, IDLE, 0 };  // V → Valuable
  channels[3] = { &servo4, ANGLE_DEFAULT,  ANGLE_HOME, IDLE, 0 };  // default

  for (int i = 0; i < 4; i++) channels[i].srv->write(ANGLE_HOME);
}

// ── Loop ─────────────────────────────────────────────────
void loop() {
  unsigned long now = millis();

  // Obstacle check — warn Pi but don't block
  float obsDist = readDistance(TRIG_OBS, ECHO_OBS);
  if (obsDist > 0 && obsDist <= 15.0) {
    Serial.println("OBSTACLE");
  }

  // Serial commands from Pi OR keyboard (Serial Monitor)
  if (Serial.available() > 0) {
    char cmd = Serial.read();
    Serial.print("CMD: "); Serial.println(cmd); // echo back what was received
    switch (cmd) {
      case 'P': case 'p': Serial.println("ACK_P"); triggerServo(0); break;
      case 'M': case 'm': Serial.println("ACK_M"); triggerServo(1); break;
      case 'V': case 'v': Serial.println("ACK_V"); triggerServo(2); break;
      case '\n': case '\r': break; // ignore newline chars sent by Serial Monitor
      default:  Serial.println("ACK_D"); triggerServo(3); break;
    }
  }

  updateServos(now);
  updateBinSensors(now);
  updateMotorB(now);
}