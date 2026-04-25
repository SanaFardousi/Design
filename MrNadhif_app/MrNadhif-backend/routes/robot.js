// routes/robot.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const createAlert = require('../utils/createAlert');
const robotAuth = require('../middleware/robotAuth');

const getActiveSession = async (robotId = 1) => {
  const result = await pool.query(
    `SELECT session_id, beach_cleaned, status, start_time
     FROM cleaning_sessions
     WHERE robot_id = $1 AND status IN ('in_progress', 'paused')
     ORDER BY start_time DESC LIMIT 1`,
    [robotId]
  );
  return result.rows[0] || null;
};

const insertNotificationIfNotDuplicate = async ({ type, sessionId, message }) => {
  const lastNotification = await pool.query(
    `SELECT type, message FROM notifications
     WHERE session_id = $1
     ORDER BY timestamp DESC LIMIT 1`,
    [sessionId]
  );

  const isDuplicate =
    lastNotification.rows.length > 0 &&
    lastNotification.rows[0].type === type &&
    lastNotification.rows[0].message === message;

  if (!isDuplicate) {
    await pool.query(
      `INSERT INTO notifications (type, timestamp, session_id, message)
       VALUES ($1, NOW(), $2, $3)`,
      [type, sessionId, message]
    );
  }
  return !isDuplicate;
};

// ---------------- FRONTEND-FACING (no auth) ----------------

// GET /api/robot/status
router.get('/status', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM robots WHERE robot_id = $1', [1]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Robot not found' });
    }
    res.json({ success: true, robot: result.rows[0] });
  } catch (error) {
    console.error('Error fetching robot status:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/robot/latest-schedule
router.get('/latest-schedule', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT schedule_id, robot_id, start_time, beach_name, geofence_json,
              TO_CHAR(start_time, 'HH24:MI') AS start_time_only
       FROM cleaning_schedules
       WHERE robot_id = $1 ORDER BY schedule_id DESC LIMIT 1`,
      [1]
    );
    res.json({ success: true, schedule: result.rows[0] || null });
  } catch (error) {
    console.error('Error fetching latest schedule:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/robot/current-session
router.get('/current-session', async (req, res) => {
  try {
    const session = await getActiveSession(1);
    res.json({ success: true, session: session || null });
  } catch (error) {
    console.error('Error fetching current session:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/robot/start  (frontend button / Pi ad-hoc fallback)
// POST /api/robot/start  (frontend "Start" button / ad-hoc start)
// Creates a session AND a robot_commands row so the Pi's command poll
// will pick it up the same way it picks up scheduled sessions.
router.post('/start', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existingSession = await client.query(
      `SELECT session_id FROM cleaning_sessions
       WHERE robot_id = $1 AND status IN ('in_progress', 'paused') LIMIT 1`,
      [1]
    );

    if (existingSession.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Robot already has an active session' });
    }

    const scheduleResult = await client.query(
      `SELECT schedule_id, beach_name, start_time FROM cleaning_schedules
       WHERE robot_id = $1 AND status = 'pending'
       ORDER BY schedule_id DESC LIMIT 1`,
      [1]
    );

    if (scheduleResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'No pending schedule found' });
    }

    const schedule = scheduleResult.rows[0];

    await client.query(`UPDATE robots SET status = 'cleaning' WHERE robot_id = $1`, [1]);

    const sessionResult = await client.query(
      `INSERT INTO cleaning_sessions (robot_id, start_time, end_time, beach_cleaned, status)
       VALUES ($1, $2, NULL, $3, 'in_progress') RETURNING *`,
      [1, schedule.start_time, schedule.beach_name]
    );
    const session = sessionResult.rows[0];

    await client.query(
      `UPDATE cleaning_schedules
       SET status = 'started', started_at = start_time, session_id = $1
       WHERE schedule_id = $2`,
      [session.session_id, schedule.schedule_id]
    );

    // NEW: insert a robot_commands row so the Pi's poll loop sees it
    // (matches exactly what the schedule worker in server.js does)
    await client.query(
      `INSERT INTO robot_commands
         (robot_id, schedule_id, session_id, command_type, payload, status)
       VALUES ($1, $2, $3, 'start_cleaning', $4, 'pending')`,
      [
        1,
        schedule.schedule_id,
        session.session_id,
        JSON.stringify({
          beach_name: schedule.beach_name,
          session_id: session.session_id
        })
      ]
    );

    await client.query('COMMIT');
    res.json({ success: true, message: 'Robot started', session });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error starting robot:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  } finally {
    client.release();
  }
});

// POST /api/robot/pause
router.post('/pause', async (req, res) => {
  try {
    await pool.query(`UPDATE robots SET status = 'paused' WHERE robot_id = $1`, [1]);
    const result = await pool.query(
      `UPDATE cleaning_sessions SET status = 'paused'
       WHERE robot_id = $1 AND status = 'in_progress' RETURNING *`,
      [1]
    );
    res.json({ success: true, message: 'Robot paused', session: result.rows[0] || null });
  } catch (error) {
    console.error('Error pausing robot:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/robot/stop
router.post('/stop', async (req, res) => {
  try {
    await pool.query(`UPDATE robots SET status = 'idle' WHERE robot_id = $1`, [1]);
    const result = await pool.query(
      `UPDATE cleaning_sessions SET status = 'completed', end_time = NOW()
       WHERE robot_id = $1 AND status IN ('in_progress', 'paused') RETURNING *`,
      [1]
    );
    res.json({ success: true, message: 'Robot stopped', session: result.rows[0] || null });
  } catch (error) {
    console.error('Error stopping robot:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/robot/schedule
router.post('/schedule', async (req, res) => {
  try {
    const { beach_name, date, start_time } = req.body;
    if (!beach_name || !date || !start_time) {
      return res.status(400).json({ success: false, message: 'Beach, date, and start time are required' });
    }
    const scheduleStart = `${date} ${start_time}:00`;
    const result = await pool.query(
      `INSERT INTO cleaning_schedules (robot_id, start_time, geofence_json, created_at, beach_name, status, started_at)
       VALUES ($1, $2::timestamp, $3, $2::timestamp, $4, 'pending', NULL)
       RETURNING *`,
      [1, scheduleStart, JSON.stringify({}), beach_name]
    );
    res.json({ success: true, message: 'Schedule saved successfully', schedule: result.rows[0] });
  } catch (error) {
    console.error('Error saving schedule:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ---------------- PI-FACING (require x-api-key) ----------------

// POST /api/robot/complete-session  ← Pi calls this when done
router.post('/complete-session', robotAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const sessionResult = await client.query(
      `UPDATE cleaning_sessions SET status = 'completed', end_time = NOW()
       WHERE robot_id = $1 AND status IN ('in_progress', 'paused')
       RETURNING session_id`,
      [1]
    );

    if (sessionResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'No active session found' });
    }

    const sessionId = sessionResult.rows[0].session_id;

    await client.query(
      `UPDATE cleaning_schedules SET status = 'completed' WHERE session_id = $1`,
      [sessionId]
    );

    await client.query(`UPDATE robots SET status = 'idle' WHERE robot_id = $1`, [1]);

    await client.query('COMMIT');
    res.json({ success: true, session_id: sessionId });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error completing session:', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  } finally {
    client.release();
  }
});

// POST /api/robot/obstacle/detected
router.post('/obstacle/detected', robotAuth, async (req, res) => {
  try {
    const activeSession = await getActiveSession(1);
    if (!activeSession) {
      return res.status(400).json({ success: false, message: 'No active cleaning session found' });
    }
    const inserted = await insertNotificationIfNotDuplicate({
      type: 'obstacle_detected',
      sessionId: activeSession.session_id,
      message: 'Obstacle detected in front of robot'
    });
    res.json({ success: true, inserted, session_id: activeSession.session_id });
  } catch (error) {
    console.error('Error logging obstacle:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/robot/obstacle/cleared
router.post('/obstacle/cleared', robotAuth, async (req, res) => {
  try {
    const activeSession = await getActiveSession(1);
    if (!activeSession) {
      return res.status(400).json({ success: false, message: 'No active cleaning session found' });
    }
    const inserted = await insertNotificationIfNotDuplicate({
      type: 'obstacle_cleared',
      sessionId: activeSession.session_id,
      message: 'Obstacle cleared, path is free'
    });
    res.json({ success: true, inserted, session_id: activeSession.session_id });
  } catch (error) {
    console.error('Error logging obstacle cleared:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/robot/telemetry  ← Pi sends battery + GPS every 10-20s
router.post('/telemetry', robotAuth, async (req, res) => {
  try {
    const { battery_level, current_lat, current_lng } = req.body;

    const robotResult = await pool.query(
      `SELECT robot_id, current_lat, current_lng, last_movement_at
       FROM robots WHERE robot_id = $1`,
      [1]
    );

    if (robotResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Robot not found' });
    }

    const robot = robotResult.rows[0];
    let lastMovementAt = robot.last_movement_at;

    // Check if robot moved (threshold: ~3 meters)
    const moved =
      robot.current_lat == null ||
      robot.current_lng == null ||
      Math.abs(Number(robot.current_lat) - Number(current_lat || 0)) > 0.00003 ||
      Math.abs(Number(robot.current_lng) - Number(current_lng || 0)) > 0.00003;

    if (moved) lastMovementAt = new Date();

    await pool.query(
      `UPDATE robots
       SET battery_level = $1,
           current_lat = $2,
           current_lng = $3,
           last_location_update = NOW(),
           last_movement_at = $4
       WHERE robot_id = $5`,
      [battery_level ?? null, current_lat ?? null, current_lng ?? null, lastMovementAt, 1]
    );

    const activeSession = await getActiveSession(1);

    if (battery_level != null && Number(battery_level) < 20) {
      await createAlert({
        type: 'battery_low',
        sessionId: activeSession ? activeSession.session_id : null,
        message: `Robot battery is low: ${battery_level}%`
      });
    }

    if (activeSession && lastMovementAt) {
      const diffMs = Date.now() - new Date(lastMovementAt).getTime();
      if (diffMs >= 3 * 60 * 1000) {
        await createAlert({
          type: 'robot_stuck',
          sessionId: activeSession.session_id,
          message: 'Robot appears stuck — GPS has not changed for 3 minutes'
        });
      }
    }

    res.json({ success: true, moved });
  } catch (error) {
    console.error('Error updating telemetry:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/robot/notifications
router.post('/notifications', robotAuth, async (req, res) => {
  try {
    const { type, message } = req.body;
    const activeSession = await getActiveSession(1);
    if (!activeSession) {
      return res.status(400).json({ success: false, message: 'No active cleaning session found' });
    }
    const inserted = await insertNotificationIfNotDuplicate({
      type,
      sessionId: activeSession.session_id,
      message
    });
    res.json({ success: true, inserted, session_id: activeSession.session_id });
  } catch (error) {
    console.error('Error inserting notification:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;