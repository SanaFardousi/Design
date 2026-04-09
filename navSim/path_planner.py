"""
Path Planning Module for Ramool 
Generates a lawnmower coverage pattern based on operational time limits
"""

import math
from dataclasses import dataclass, field
from typing import List, Tuple

# =============================================================================
# SYSTEM PARAMETERS & CALIBRATION
# =============================================================================

# Nominal velocity on sand (m/s). Calibrate via field testing.
ROBOT_SPEED_MS = 0.3  

# Effective cleaning width per pass (m). Matches mechanical sifter dimensions.
STRIP_WIDTH_M = 0.5  

# Fixed temporal cost for 90-degree rotations (seconds).
TURN_TIME_SECONDS = 5.0  

# Safety buffer for return-to-home transit at end of mission (seconds).
RETURN_TIME_BUFFER_SECONDS = 180  

# =============================================================================
# GEODETIC CONSTANTS (Kuwait Region - 29°N)
# =============================================================================

# Linear approximations for GPS to Cartesian conversion.
METRES_PER_DEGREE_LAT = 111000.0
METRES_PER_DEGREE_LON = 97000.0  # Calculated as 111000 * cos(29°)

@dataclass
class Waypoint:
    """
    Representation of a mission target coordinate.
    
    Attributes:
        latitude/longitude: Decimal degree coordinates.
        label: Operational state ("clean", "shift", or "return").
        strip: Index of the current coverage pass.
    """
    latitude: float
    longitude: float
    label: str = "clean"
    strip: int = 0

    def __repr__(self):
        return f"WP({self.latitude:.6f}, {self.longitude:.6f}, mode='{self.label}', strip={self.strip})"

@dataclass
class CoveragePlan:
    """Encapsulates the generated mission trajectory and performance metrics."""
    waypoints: List[Waypoint]
    strips_planned: int
    total_distance_m: float
    estimated_time_min: float
    coverage_percent: float
    time_limited: bool
    home_position: Tuple[float, float]
    zone_width_m: float
    zone_height_m: float

    def summary(self) -> str:
        status = " [!] TIME CONSTRAINED" if self.time_limited else ""
        return (
            f"Mission Summary{status}:\n"
            f"  Coverage: {self.coverage_percent:.1f}% | Strips: {self.strips_planned}\n"
            f"  Distance: {self.total_distance_m:.1f} m | Est. Time: {self.estimated_time_min:.1f} min\n"
            f"  Dimensions: {self.zone_width_m:.1f}m x {self.zone_height_m:.1f}m"
        )

# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

def distance_metres(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Computes Haversine-equivalent distance using flat-earth approximation for local scales."""
    delta_lat_m = (lat2 - lat1) * METRES_PER_DEGREE_LAT
    delta_lon_m = (lon2 - lon1) * METRES_PER_DEGREE_LON
    return math.sqrt(delta_lat_m ** 2 + delta_lon_m ** 2)

def metres_to_degrees_lat(metres: float) -> float:
    """Converts linear displacement to latitude decimal offset."""
    return metres / METRES_PER_DEGREE_LAT

def time_for_strip_transition(strip_width_m: float) -> float:
    """Calculates temporal cost of the U-turn maneuver between passes."""
    travel_time = strip_width_m / ROBOT_SPEED_MS
    return travel_time + (2 * TURN_TIME_SECONDS)

# =============================================================================
# CORE PLANNING LOGIC
# =============================================================================

def generate_plan(
    zone_coords: List[Tuple[float, float]],
    time_budget_minutes: float = 30.0,
    strip_width_m: float = STRIP_WIDTH_M
) -> CoveragePlan:
    """
    Generates an optimized coverage path within a polygonal boundary.
    
    The algorithm fits a boustrophedon pattern into the bounding box of the
    provided coordinates, incrementally adding passes until the time budget
    (including safety buffer) is exhausted.
    """
    if len(zone_coords) < 3:
        raise ValueError("Mission zone requires a minimum of 3 vertices.")

    total_budget_seconds = time_budget_minutes * 60.0
    usable_seconds = total_budget_seconds - RETURN_TIME_BUFFER_SECONDS

    if usable_seconds <= 0:
        raise ValueError("Time budget insufficient for return safety buffer.")

    # Define Spatial Bounds
    min_lat = min(c for c in zone_coords)
    max_lat = max(c for c in zone_coords)
    min_lon = min(c for c in zone_coords)
    max_lon = max(c for c in zone_coords)

    zone_width_m = (max_lon - min_lon) * METRES_PER_DEGREE_LON
    zone_height_m = (max_lat - min_lat) * METRES_PER_DEGREE_LAT

    max_strips = max(1, int(zone_height_m / strip_width_m))
    strip_step_deg = metres_to_degrees_lat(strip_width_m)
    
    # Initialization
    waypoints = []
    time_used = 0.0
    strips_added = 0
    time_limited = False
    home_lat, home_lon = min_lat, min_lon
    first_strip_lat = min_lat + (strip_step_deg / 2.0)

    for i in range(max_strips):
        current_lat = first_strip_lat + (i * strip_step_deg)
        
        # Determine pass direction (Alternating East/West)
        going_east = (i % 2 == 0)
        lon_start = min_lon if going_east else max_lon
        lon_end = max_lon if going_east else min_lon

        # Mission feasibility check (Current Pass + Next Transition + Return transit)
        pass_time = zone_width_m / ROBOT_SPEED_MS
        transition_time = time_for_strip_transition(strip_width_m) if i < max_strips - 1 else 0
        return_transit = distance_metres(current_lat, lon_end, home_lat, home_lon) / ROBOT_SPEED_MS

        if time_used + pass_time + transition_time + return_transit > usable_seconds:
            time_limited = (i < max_strips - 1)
            break

        # Log Waypoints: Strip Start and End
        waypoints.append(Waypoint(current_lat, lon_start, "clean", i))
        waypoints.append(Waypoint(current_lat, lon_end, "clean", i))

        # Log Repositioning Waypoint
        if i < max_strips - 1:
            next_lat = first_strip_lat + ((i + 1) * strip_step_deg)
            waypoints.append(Waypoint(next_lat, lon_end, "shift", i))

        time_used += pass_time + transition_time
        strips_added += 1

    # Final Return to Home/Charging Station
    waypoints.append(Waypoint(home_lat, home_lon, "return", -1))

    # Calculate Plan Metrics
    total_dist = 0.0
    for j in range(len(waypoints) - 1):
        total_dist += distance_metres(
            waypoints[j].latitude, waypoints[j].longitude,
            waypoints[j+1].latitude, waypoints[j+1].longitude
        )

    est_time_min = (time_used + (max(0, strips_added - 1) * 2 * TURN_TIME_SECONDS)) / 60.0
    coverage_pct = min(100.0, (strips_added * strip_width_m * zone_width_m) / (zone_width_m * zone_height_m) * 100)

    return CoveragePlan(
        waypoints=waypoints,
        strips_planned=strips_added,
        total_distance_m=total_dist,
        estimated_time_min=est_time_min,
        coverage_percent=coverage_pct,
        time_limited=time_limited,
        home_position=(home_lat, home_lon),
        zone_width_m=zone_width_m,
        zone_height_m=zone_height_m
    )

class WaypointTracker:
    """
    Manages real-time navigation progress during mission execution.
    To be integrated with the motor control and GPS feedback loops.
    """
    ARRIVAL_THRESHOLD_M = 3.0  # Tolerance for waypoint achievement

    def __init__(self, plan: CoveragePlan):
        self._waypoints = plan.waypoints
        self._index = 0

    @property
    def current_waypoint(self) -> Waypoint:
        return self._waypoints[self._index] if self._index < len(self._waypoints) else None

    @property
    def finished(self) -> bool:
        return self._index >= len(self._waypoints)

    def has_arrived(self, lat: float, lon: float) -> bool:
        """Determines if the robot has reached the current target within threshold."""
        wp = self.current_waypoint
        if not wp: return False
        return distance_metres(lat, lon, wp.latitude, wp.longitude) <= self.ARRIVAL_THRESHOLD_M

    def advance(self):
        """Increments mission state to the subsequent waypoint."""
        if not self.finished:
            self._index += 1