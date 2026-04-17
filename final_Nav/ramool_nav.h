/*
 * ramool_nav.h
 * Ramool Beach Cleaning Robot — Shared Navigation Header
 * CpE-494: Computer System Engineering, 2025-2026
 *
 * Shared constants and functions used by all three beach sketches.
 * Include this file at the top of each beach sketch.
 *
 * Library required: TinyGPSPlus
 * Install: Arduino IDE -> Library Manager -> search "TinyGPSPlus"
 */

#ifndef RAMOOL_NAV_H
#define RAMOOL_NAV_H

#include <math.h>

/* -- Robot constants ------------------------------------------------------- */
#define SPEED_MS          0.3f   /* Robot speed on sand (m/s). Measure on site. */
#define STRIP_WIDTH_M     0.5f   /* Cleaning width of sifting tray (m).         */
#define ARRIVE_THRESH_M   3.0f   /* How close = "arrived" at a waypoint (m).    */
#define RETURN_BUFFER_S   180.0f /* Seconds reserved for the return trip home.  */
#define SESSION_S         1800.0f/* Total session time: 30 minutes.             */

/* -- GPS unit conversion at Kuwait latitude (~29 N) ------------------------ */
#define M_PER_DEG_LAT     111000.0f
#define M_PER_DEG_LON      97000.0f

/* -- Straight-line distance between two GPS points (metres) ---------------- */
inline float gpsDistance(float lat1, float lon1, float lat2, float lon2) {
    float dLat = (lat2 - lat1) * M_PER_DEG_LAT;
    float dLon = (lon2 - lon1) * M_PER_DEG_LON;
    return sqrt(dLat * dLat + dLon * dLon);
}

#endif
