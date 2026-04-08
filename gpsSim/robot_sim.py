import math
import time
import random
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import FancyArrowPatch
from matplotlib.gridspec import GridSpec
import numpy as np

# ── TUNABLE PARAMETERS  ──────────
BASE_SPEED          = 160        # 0–255
TURN_SPEED          = 120
WAYPOINT_RADIUS_M   = 1.0        # metres
HEADING_TOLERANCE   = 8.0        # degrees
STEERING_KP         = 2.2
ROBOT_SPEED_MPS     = 0.8        # metres per second (tune for your robot)
GYRO_DRIFT_DEG_S    = 0.3        # simulated yaw drift °/s
GPS_NOISE_M         = 1.2        # simulated GPS noise in metres
DT                  = 0.05       # simulation timestep seconds

# ── WAYPOINTS (lat, lon) ─────────────────────────────────────
# WAYPOINTS = [
#     (29.369170, 47.978710),   # WP-0  start
#     (29.369250, 47.978820),   # WP-1
#     (29.369380, 47.978750),   # WP-2
#     (29.369200, 47.978600),   # WP-3  final
# ]
WAYPOINTS = [
    (29.369170, 47.978710),  # WP-0 start (bottom-left)
    (29.369170, 47.978820),  # WP-1 bottom-right
    (29.369280, 47.978820),  # WP-2 top-right
    (29.369280, 47.978710),
    (29.369170, 47.978710)  # WP-3 top-left
]
# ── GEOMETRY HELPERS ─────────────────
EARTH_R = 6_371_000.0

def haversine(lat1, lon1, lat2, lon2):
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * \
        math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    return EARTH_R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

def bearing(lat1, lon1, lat2, lon2):
    dlon = math.radians(lon2 - lon1)
    lat1, lat2 = math.radians(lat1), math.radians(lat2)
    x = math.sin(dlon) * math.cos(lat2)
    y = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dlon)
    return (math.degrees(math.atan2(x, y)) + 360) % 360

def angle_diff(target, current):
    d = target - current
    while d >  180: d -= 360
    while d < -180: d += 360
    return d

def meters_to_deg(meters):
    """Approximate: converts metres offset to degrees (lat/lon scale)"""
    lat_deg = meters / EARTH_R * (180 / math.pi)
    return lat_deg

def move_position(lat, lon, heading_deg, dist_m):
    """Move a GPS position by dist_m in heading_deg direction"""
    d_lat = (dist_m * math.cos(math.radians(heading_deg))) / EARTH_R * (180/math.pi)
    d_lon = (dist_m * math.sin(math.radians(heading_deg))) / \
            (EARTH_R * math.cos(math.radians(lat))) * (180/math.pi)
    return lat + d_lat, lon + d_lon

def latlon_to_xy(lat, lon, origin_lat, origin_lon):
    """Convert lat/lon to local XY in metres relative to origin"""
    x = (lon - origin_lon) * math.pi/180 * EARTH_R * math.cos(math.radians(origin_lat))
    y = (lat - origin_lat) * math.pi/180 * EARTH_R
    return x, y

# ── SIMULATION ───────────────────────────────────────────────
def run_simulation():
    origin_lat, origin_lon = WAYPOINTS[0]

    # Robot state
    true_lat, true_lon = origin_lat, origin_lon
    yaw_deg   = 0.0          # robot's internal heading estimate
    true_yaw  = 0.0          # actual heading (may differ due to drift)
    wp_idx    = 0

    # Logging
    path_x, path_y   = [], []
    gps_x,  gps_y    = [], []
    yaw_log          = []
    bearing_log      = []
    dist_log         = []
    error_log        = []
    steer_log        = []
    time_log         = []
    wp_reached_times = []
    wp_reached_xy    = []

    t = 0.0
    step = 0
    max_steps = 8000
    status_log = []

    while wp_idx < len(WAYPOINTS) and step < max_steps:
        target_lat, target_lon = WAYPOINTS[wp_idx]

        # ── Simulate GPS with noise ──────────────────────────
        noise_lat = (random.gauss(0, GPS_NOISE_M) / EARTH_R) * (180/math.pi)
        noise_lon = (random.gauss(0, GPS_NOISE_M) / EARTH_R) * (180/math.pi) \
                    / math.cos(math.radians(true_lat))
        gps_lat = true_lat + noise_lat
        gps_lon = true_lon + noise_lon

        # ── Simulate gyro with drift ─────────────────────────
        drift = random.gauss(GYRO_DRIFT_DEG_S, 0.05) * DT
        yaw_deg = (yaw_deg + drift) % 360   # drifts slowly over time

        # ── Navigation logic (mirrors Arduino exactly) ───────
        dist   = haversine(gps_lat, gps_lon, target_lat, target_lon)
        brng   = bearing(gps_lat, gps_lon, target_lat, target_lon)
        error  = angle_diff(brng, yaw_deg)

        steer = error * STEERING_KP
        steer = max(-BASE_SPEED, min(BASE_SPEED, steer))

        left_pwm  = BASE_SPEED + steer
        right_pwm = BASE_SPEED - steer

        # Hard turn in place if misaligned > 45°
        if abs(error) > 45:
            if error > 0:
                actual_turn = +TURN_SPEED * 0.5 * DT   # turn right
            else:
                actual_turn = -TURN_SPEED * 0.5 * DT   # turn left
            true_yaw = (true_yaw + actual_turn) % 360
            yaw_deg  = (yaw_deg  + actual_turn) % 360
            forward_dist = 0
        else:
            # Proportional steer: average motor speed → forward motion
            avg_speed_pct = (abs(left_pwm) + abs(right_pwm)) / 2 / 255
            forward_dist  = ROBOT_SPEED_MPS * avg_speed_pct * DT
            # Heading adjusts proportionally
            turn_rate = (right_pwm - left_pwm) / 255 * 40   # deg/s
            true_yaw  = (true_yaw + turn_rate * DT) % 360
            yaw_deg   = (yaw_deg  + turn_rate * DT) % 360

        # Move robot
        true_lat, true_lon = move_position(true_lat, true_lon, true_yaw, forward_dist)

        # Log everything
        rx, ry = latlon_to_xy(true_lat, true_lon, origin_lat, origin_lon)
        gx, gy = latlon_to_xy(gps_lat, gps_lon, origin_lat, origin_lon)
        path_x.append(rx);  path_y.append(ry)
        gps_x.append(gx);   gps_y.append(gy)
        yaw_log.append(yaw_deg)
        bearing_log.append(brng)
        dist_log.append(dist)
        error_log.append(error)
        steer_log.append(steer)
        time_log.append(t)

        # ── Waypoint reached? ────────────────────────────────
        if dist < WAYPOINT_RADIUS_M:
            wx, wy = latlon_to_xy(target_lat, target_lon, origin_lat, origin_lon)
            status_log.append(f"t={t:.1f}s  ✓ Reached WP-{wp_idx}  dist={dist:.2f}m")
            wp_reached_times.append(t)
            wp_reached_xy.append((rx, ry))
            wp_idx += 1
            time.sleep(0)   # no real pause in simulation

        t += DT
        step += 1

    if wp_idx >= len(WAYPOINTS):
        status_log.append(f"t={t:.1f}s  ★ PATH COMPLETE — all {len(WAYPOINTS)} waypoints reached!")
    else:
        status_log.append(f"t={t:.1f}s  ✗ Simulation ended before completing path")

    return {
        "path_x": path_x, "path_y": path_y,
        "gps_x": gps_x, "gps_y": gps_y,
        "yaw_log": yaw_log, "bearing_log": bearing_log,
        "dist_log": dist_log, "error_log": error_log,
        "steer_log": steer_log, "time_log": time_log,
        "wp_reached_times": wp_reached_times,
        "wp_reached_xy": wp_reached_xy,
        "status_log": status_log,
        "origin_lat": origin_lat, "origin_lon": origin_lon,
    }

# ── PLOTTING ─────────────────────────────────────────────────
def plot_results(data):
    fig = plt.figure(figsize=(18, 13), facecolor='#0d1117')
    fig.suptitle("GPS + IMU Waypoint Navigation — Robot Simulator",
                 fontsize=16, color='#e6edf3', fontweight='bold', y=0.98)

    gs = GridSpec(3, 3, figure=fig, hspace=0.45, wspace=0.38,
                  left=0.06, right=0.97, top=0.93, bottom=0.06)

    DARK  = '#0d1117'
    PANEL = '#161b22'
    GRID  = '#21262d'
    TEXT  = '#e6edf3'
    DIM   = '#8b949e'
    CYAN  = '#39d0d8'
    GREEN = '#3fb950'
    ORANGE= '#f0883e'
    RED   = '#f85149'
    BLUE  = '#58a6ff'
    YELLOW= '#e3b341'

    def style_ax(ax, title):
        ax.set_facecolor(PANEL)
        ax.tick_params(colors=DIM, labelsize=8)
        ax.spines[:].set_color(GRID)
        ax.title.set_color(TEXT)
        ax.title.set_fontsize(10)
        ax.title.set_fontweight('bold')
        ax.set_title(title)
        ax.grid(color=GRID, linewidth=0.6, linestyle='--', alpha=0.7)
        for label in ax.get_xticklabels() + ax.get_yticklabels():
            label.set_color(DIM)

    origin_lat = data['origin_lat']
    origin_lon = data['origin_lon']

    # ── Panel 1: Map view ────────────────────────────────────
    ax_map = fig.add_subplot(gs[0:2, 0:2])
    style_ax(ax_map, "Robot Path (Top-Down Map View)")
    ax_map.set_xlabel("East–West  (metres)", color=DIM, fontsize=8)
    ax_map.set_ylabel("North–South  (metres)", color=DIM, fontsize=8)

    # GPS scatter (noisy cloud)
    ax_map.scatter(data['gps_x'][::5], data['gps_y'][::5],
                   s=4, color=BLUE, alpha=0.18, label='GPS readings (noisy)', zorder=2)

    # True path
    ax_map.plot(data['path_x'], data['path_y'],
                color=CYAN, linewidth=1.8, alpha=0.9, label='True robot path', zorder=3)

    # Waypoints
    wp_colors = [GREEN, YELLOW, ORANGE, RED]
    for i, (wlat, wlon) in enumerate(WAYPOINTS):
        wx, wy = latlon_to_xy(wlat, wlon, origin_lat, origin_lon)
        circle = plt.Circle((wx, wy), WAYPOINT_RADIUS_M,
                             color=wp_colors[i % len(wp_colors)],
                             fill=True, alpha=0.15, zorder=4)
        ax_map.add_patch(circle)
        circle2 = plt.Circle((wx, wy), WAYPOINT_RADIUS_M,
                              color=wp_colors[i % len(wp_colors)],
                              fill=False, linewidth=1.5, linestyle='--', zorder=4)
        ax_map.add_patch(circle2)
        ax_map.plot(wx, wy, 'o', color=wp_colors[i % len(wp_colors)],
                    markersize=9, zorder=5)
        ax_map.annotate(f'WP-{i}', (wx, wy),
                        textcoords='offset points', xytext=(8, 6),
                        color=wp_colors[i % len(wp_colors)], fontsize=9, fontweight='bold')

    # Draw ideal straight-line path between waypoints
    wp_xs = [latlon_to_xy(w[0],w[1],origin_lat,origin_lon)[0] for w in WAYPOINTS]
    wp_ys = [latlon_to_xy(w[0],w[1],origin_lat,origin_lon)[1] for w in WAYPOINTS]
    ax_map.plot(wp_xs, wp_ys, '--', color='#ffffff', linewidth=0.8,
                alpha=0.25, label='Ideal path', zorder=2)

    # Start marker
    ax_map.plot(data['path_x'][0], data['path_y'][0],
                's', color=GREEN, markersize=10, zorder=6, label='Start')

    # Reached markers
    for rx, ry in data['wp_reached_xy']:
        ax_map.plot(rx, ry, '*', color=YELLOW, markersize=14, zorder=7)

    # Robot heading arrow at end
    if len(data['path_x']) > 1:
        ex, ey = data['path_x'][-1], data['path_y'][-1]
        ey_yaw = data['yaw_log'][-1]
        ax_map.annotate('', xy=(ex + 1.5*math.sin(math.radians(ey_yaw)),
                                ey + 1.5*math.cos(math.radians(ey_yaw))),
                        xytext=(ex, ey),
                        arrowprops=dict(arrowstyle='->', color=RED, lw=2))

    ax_map.legend(loc='upper left', fontsize=7.5,
                  facecolor=PANEL, labelcolor=TEXT, edgecolor=GRID)

    # ── Panel 2: Heading over time ───────────────────────────
    ax_head = fig.add_subplot(gs[0, 2])
    style_ax(ax_head, "Heading vs Target Bearing")
    ax_head.plot(data['time_log'], data['yaw_log'],
                 color=CYAN, linewidth=1.2, label='Yaw (IMU)')
    ax_head.plot(data['time_log'], data['bearing_log'],
                 color=ORANGE, linewidth=1.2, linestyle='--', label='Target bearing')
    for t in data['wp_reached_times']:
        ax_head.axvline(t, color=GREEN, linewidth=0.8, alpha=0.6)
    ax_head.set_xlabel("Time (s)", color=DIM, fontsize=8)
    ax_head.set_ylabel("Degrees °", color=DIM, fontsize=8)
    ax_head.legend(fontsize=7, facecolor=PANEL, labelcolor=TEXT, edgecolor=GRID)

    # ── Panel 3: Distance to waypoint ───────────────────────
    ax_dist = fig.add_subplot(gs[1, 2])
    style_ax(ax_dist, "📏 Distance to Current Waypoint")
    ax_dist.plot(data['time_log'], data['dist_log'],
                 color=BLUE, linewidth=1.3)
    ax_dist.axhline(WAYPOINT_RADIUS_M, color=GREEN, linewidth=1,
                    linestyle='--', label=f'Arrival radius ({WAYPOINT_RADIUS_M}m)')
    for t in data['wp_reached_times']:
        ax_dist.axvline(t, color=GREEN, linewidth=0.8, alpha=0.6)
    ax_dist.set_xlabel("Time (s)", color=DIM, fontsize=8)
    ax_dist.set_ylabel("Metres", color=DIM, fontsize=8)
    ax_dist.legend(fontsize=7, facecolor=PANEL, labelcolor=TEXT, edgecolor=GRID)

    # ── Panel 4: Heading error ───────────────────────────────
    ax_err = fig.add_subplot(gs[2, 0])
    style_ax(ax_err, "⚠️  Heading Error (degrees)")
    ax_err.fill_between(data['time_log'], data['error_log'],
                        color=RED, alpha=0.35)
    ax_err.plot(data['time_log'], data['error_log'],
                color=RED, linewidth=1.0)
    ax_err.axhline(0, color=TEXT, linewidth=0.6, alpha=0.4)
    ax_err.axhline( HEADING_TOLERANCE, color=YELLOW, linewidth=0.8,
                   linestyle=':', alpha=0.7)
    ax_err.axhline(-HEADING_TOLERANCE, color=YELLOW, linewidth=0.8,
                   linestyle=':', alpha=0.7, label=f'±{HEADING_TOLERANCE}° tolerance')
    for t in data['wp_reached_times']:
        ax_err.axvline(t, color=GREEN, linewidth=0.8, alpha=0.6)
    ax_err.set_xlabel("Time (s)", color=DIM, fontsize=8)
    ax_err.set_ylabel("Error °", color=DIM, fontsize=8)
    ax_err.legend(fontsize=7, facecolor=PANEL, labelcolor=TEXT, edgecolor=GRID)

    # ── Panel 5: Steering correction ────────────────────────
    ax_steer = fig.add_subplot(gs[2, 1])
    style_ax(ax_steer, "🎮 Steering Correction (P-Controller)")
    ax_steer.fill_between(data['time_log'], data['steer_log'],
                          color=CYAN, alpha=0.3)
    ax_steer.plot(data['time_log'], data['steer_log'],
                  color=CYAN, linewidth=1.0)
    ax_steer.axhline(0, color=TEXT, linewidth=0.6, alpha=0.4)
    for t in data['wp_reached_times']:
        ax_steer.axvline(t, color=GREEN, linewidth=0.8, alpha=0.6)
    ax_steer.set_xlabel("Time (s)", color=DIM, fontsize=8)
    ax_steer.set_ylabel("Correction (PWM units)", color=DIM, fontsize=8)

    # ── Panel 6: Status log ──────────────────────────────────
    ax_log = fig.add_subplot(gs[2, 2])
    ax_log.set_facecolor(PANEL)
    ax_log.spines[:].set_color(GRID)
    ax_log.set_xticks([]); ax_log.set_yticks([])
    ax_log.set_title("Event Log", color=TEXT, fontsize=10, fontweight='bold')

    log_text = "\n".join(data['status_log'])
    ax_log.text(0.05, 0.95, log_text,
                transform=ax_log.transAxes,
                fontsize=8.5, verticalalignment='top',
                fontfamily='monospace',
                color=GREEN,
                bbox=dict(boxstyle='round', facecolor=DARK, alpha=0.6, edgecolor=GRID))

    # ── Stats bar ────────────────────────────────────────────
    total_time = data['time_log'][-1] if data['time_log'] else 0
    total_dist = sum(
        math.sqrt((data['path_x'][i]-data['path_x'][i-1])**2 +
                  (data['path_y'][i]-data['path_y'][i-1])**2)
        for i in range(1, len(data['path_x']))
    )
    avg_err = sum(abs(e) for e in data['error_log']) / max(len(data['error_log']), 1)

    stats = (f"  Simulation time: {total_time:.1f}s    "
             f"Total distance: {total_dist:.1f}m    "
             f"Avg heading error: {avg_err:.1f}°    "
             f"GPS noise: ±{GPS_NOISE_M}m    "
             f"Gyro drift: {GYRO_DRIFT_DEG_S}°/s    "
             f"Kp: {STEERING_KP}")
    fig.text(0.5, 0.01, stats, ha='center', fontsize=8,
             color=DIM, fontfamily='monospace')

    plt.savefig('robot_simulation.png',dpi=150, bbox_inches='tight', facecolor=DARK)
    print("Saved: robot_simulation.png")

# ── MAIN ─────────────────────────────────────────────────────
if __name__ == '__main__':
    print("Running simulation...")
    random.seed(42)
    data = run_simulation()
    for line in data['status_log']:
        print(line)
    print(f"\nTotal steps simulated: {len(data['time_log'])}")
    print(f"Simulation duration:   {data['time_log'][-1]:.1f}s")
    plot_results(data)
    print("Done.")
