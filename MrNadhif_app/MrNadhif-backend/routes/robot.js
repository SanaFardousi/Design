const express = require('express');
const router = express.Router();
const pool = require('../config/db');

//get current active session
const getActiveSession = async (robotId = 1) => {
  const result = await pool.query(
    `SELECT session_id, beach_cleaned, status, start_time
     FROM cleaning_sessions
     WHERE robot_id = $1 AND status IN ('in_progress', 'paused')
     ORDER BY start_time DESC
     LIMIT 1`,
    [robotId]
  );

  return result.rows[0] || null;
};

// insert notification only if it is not an immediate duplicate
const insertNotificationIfNotDuplicate = async ({ type, sessionId, message }) => {
  const lastNotification = await pool.query(
    `SELECT type, message
     FROM notifications
     WHERE session_id = $1
     ORDER BY timestamp DESC
     LIMIT 1`,
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

// GET current robot row
router.get('/status', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM robots WHERE robot_id = $1',
      [1]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Robot not found'
      });
    }

    res.json({
      success: true,
      robot: result.rows[0]
    });
  } catch (error) {
    console.error('Error fetching robot status:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// GET latest saved schedule
router.get('/latest-schedule', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         schedule_id,
         robot_id,
         start_time,
         beach_name,
         geofence_json,
         TO_CHAR(start_time, 'HH24:MI') AS start_time_only
       FROM cleaning_schedules
       WHERE robot_id = $1
       ORDER BY schedule_id DESC
       LIMIT 1`,
      [1]
    );

    res.json({
      success: true,
      schedule: result.rows[0] || null
    });
  } catch (error) {
    console.error('Error fetching latest schedule:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// GET current active session
router.get('/current-session', async (req, res) => {
  try {
    const session = await getActiveSession(1);

    res.json({
      success: true,
      session: session || null
    });
  } catch (error) {
    console.error('Error fetching current session:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// START actual cleaning session
router.post('/start', async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const existingSession = await client.query(
      `SELECT session_id
       FROM cleaning_sessions
       WHERE robot_id = $1 AND status IN ('in_progress', 'paused')
       LIMIT 1`,
      [1]
    );

    if (existingSession.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Robot already has an active session'
      });
    }

    // Get the latest pending schedule
    const scheduleResult = await client.query(
      `SELECT schedule_id, beach_name, start_time
       FROM cleaning_schedules
       WHERE robot_id = $1 AND status = 'pending'
       ORDER BY schedule_id DESC
       LIMIT 1`,
      [1]
    );

    if (scheduleResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'No pending schedule found'
      });
    }

    const schedule = scheduleResult.rows[0];

    // Update robot status
    await client.query(
      `UPDATE robots
       SET status = 'cleaning'
       WHERE robot_id = $1`,
      [1]
    );

    // Insert session using the SAME scheduled start_time
    const sessionResult = await client.query(
      `INSERT INTO cleaning_sessions (
         robot_id,
         start_time,
         end_time,
         beach_cleaned,
         status
       )
       VALUES ($1, $2, NULL, $3, $4)
       RETURNING *`,
      [1, schedule.start_time, schedule.beach_name, 'in_progress']
    );

    const session = sessionResult.rows[0];

    // Mark schedule as started
    await client.query(
      `UPDATE cleaning_schedules
       SET status = 'started',
           started_at = start_time,
           session_id = $1
       WHERE schedule_id = $2`,
      [session.session_id, schedule.schedule_id]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Robot started',
      session
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error starting robot:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  } finally {
    client.release();
  }
});

// PAUSE active session
router.post('/pause', async (req, res) => {
  try {
    await pool.query(
      `UPDATE robots
       SET status = 'paused'
       WHERE robot_id = $1`,
      [1]
    );

    const result = await pool.query(
      `UPDATE cleaning_sessions
       SET status = 'paused'
       WHERE robot_id = $1 AND status = 'in_progress'
       RETURNING *`,
      [1]
    );

    res.json({
      success: true,
      message: 'Robot paused',
      session: result.rows[0] || null
    });
  } catch (error) {
    console.error('Error pausing robot:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// STOP session
router.post('/stop', async (req, res) => {
  try {
    await pool.query(
      `UPDATE robots
       SET status = 'idle'
       WHERE robot_id = $1`,
      [1]
    );

    const result = await pool.query(
      `UPDATE cleaning_sessions
       SET status = 'completed', end_time = NOW()
       WHERE robot_id = $1 AND status IN ('in_progress', 'paused')
       RETURNING *`,
      [1]
    );

    res.json({
      success: true,
      message: 'Robot stopped',
      session: result.rows[0] || null
    });
  } catch (error) {
    console.error('Error stopping robot:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// obstacle detected notification
router.post('/obstacle/detected', async (req, res) => {
  try {
    const activeSession = await getActiveSession(1);

    if (!activeSession) {
      return res.status(400).json({
        success: false,
        message: 'No active cleaning session found'
      });
    }

    const inserted = await insertNotificationIfNotDuplicate({
      type: 'obstacle_detected',
      sessionId: activeSession.session_id,
      message: 'Obstacle detected in front of robot'
    });

    res.json({
      success: true,
      inserted,
      session_id: activeSession.session_id
    });
  } catch (error) {
    console.error('Error logging obstacle:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// obstacle cleared notification
router.post('/obstacle/cleared', async (req, res) => {
  try {
    const activeSession = await getActiveSession(1);

    if (!activeSession) {
      return res.status(400).json({
        success: false,
        message: 'No active cleaning session found'
      });
    }

    const inserted = await insertNotificationIfNotDuplicate({
      type: 'obstacle_cleared',
      sessionId: activeSession.session_id,
      message: 'Obstacle cleared, path is free'
    });

    res.json({
      success: true,
      inserted,
      session_id: activeSession.session_id
    });
  } catch (error) {
    console.error('Error logging obstacle cleared:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// SAVE schedule in cleaning_schedules
router.post('/schedule', async (req, res) => {
  try {
    const { beach_name, date, start_time } = req.body;

    if (!beach_name || !date || !start_time) {
      return res.status(400).json({
        success: false,
        message: 'Beach, date, and start time are required'
      });
    }

    const scheduleStart = `${date} ${start_time}:00`;
    const geofenceJson = JSON.stringify({});

    const result = await pool.query(
      `INSERT INTO cleaning_schedules (
         robot_id,
         start_time,
         geofence_json,
         created_at,
         beach_name,
         status,
         started_at
       )
       VALUES ($1, $2::timestamp, $3, $2::timestamp, $4, $5, $6)
       RETURNING *`,
      [1, scheduleStart, geofenceJson, beach_name, 'pending', null]
    );

    res.json({
      success: true,
      message: 'Schedule saved successfully',
      schedule: result.rows[0]
    });
  } catch (error) {
    console.error('Error saving schedule:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// valuable item found notification
router.post('/notifications', async (req, res) => {
  try {
    const { type, message } = req.body;
    const activeSession = await getActiveSession(1);

    if (!activeSession) {
      return res.status(400).json({
        success: false,
        message: 'No active cleaning session found'
      });
    }

    const inserted = await insertNotificationIfNotDuplicate({
      type: type,
      sessionId: activeSession.session_id,
      message: message
    });

    res.json({
      success: true,
      inserted,
      session_id: activeSession.session_id
    });
  } catch (error) {
    console.error('Error inserting notification:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});
// ADD THIS to robot.js — Pi calls this when cleaning is done
router.post('/complete-session', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // End the active session
    const sessionResult = await client.query(
      `UPDATE cleaning_sessions
       SET status = 'completed', end_time = NOW()
       WHERE robot_id = $1 AND status IN ('in_progress', 'paused')
       RETURNING session_id`,
      [1]
    );

    if (sessionResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'No active session found' });
    }

    const sessionId = sessionResult.rows[0].session_id;

    // Mark schedule as completed
    await client.query(
      `UPDATE cleaning_schedules
       SET status = 'completed'
       WHERE session_id = $1`,
      [sessionId]
    );

    // Set robot back to idle
    await client.query(
      `UPDATE robots SET status = 'idle' WHERE robot_id = $1`,
      [1]
    );

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

module.exports = router;