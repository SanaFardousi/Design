# 🚗 GPS + IMU Waypoint Navigation Simulator

A Python-based simulator for a GPS + IMU robot that follows waypoints using the same logic as an Arduino navigation system.

## 📌 Features

* Simulates **GPS noise** and **gyro drift**
* Uses **real navigation math** (haversine + bearing)
* Implements **proportional steering control (P-controller)**
* Follows a sequence of **GPS waypoints**
* Generates a detailed **visual report (robot_simulation.png)**

## ⚙️ How It Works

The robot:

1. Reads simulated GPS + IMU data
2. Calculates distance & bearing to the next waypoint
3. Computes heading error
4. Applies steering correction
5. Moves toward the waypoint until reached

## ▶️ Usage

```bash
pip install numpy matplotlib
python3 robot_sim.py
```

## 📊 Output

![output](https://github.com/SanaFardousi/Design/blob/main/gpsSim/robot_simulation.png)

* **robot_simulation.png** showing:

  * Robot path vs ideal path
  * GPS noise visualization
  * Heading vs target bearing
  * Distance to waypoint
  * Steering & error plots
  * Event log

## 🎯 Purpose

Designed for testing and tuning waypoint navigation algorithms before deploying to real robots.

