const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// helper: get current active session
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

// helper: insert notification only if it is not an immediate duplicate
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

// SAVE schedule in cleaning_schedules
router.post('/schedule', async (req, res) => {
  try {
    const { beach_name, date, start_time, end_time } = req.body;

    if (!beach_name || !date || !start_time || !end_time) {
      return res.status(400).json({
        success: false,
        message: 'Beach, date, start time, and end time are required'
      });
    }

    const scheduleStart = `${date} ${start_time}:00`;

    const geofenceJson = JSON.stringify({
      end_time
    });

    const result = await pool.query(
      `INSERT INTO cleaning_schedules (robot_id, start_time, geofence_json, beach_name)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [1, scheduleStart, geofenceJson, beach_name]
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
  try {
    const { beach_name } = req.body;

    if (!beach_name) {
      return res.status(400).json({
        success: false,
        message: 'beach_name is required'
      });
    }

    const existingSession = await getActiveSession(1);

    if (existingSession) {
      return res.status(400).json({
        success: false,
        message: 'Robot already has an active session'
      });
    }

    await pool.query(
      `UPDATE robots
       SET status = 'cleaning'
       WHERE robot_id = $1`,
      [1]
    );

    const result = await pool.query(
      `INSERT INTO cleaning_sessions (robot_id, start_time, end_time, beach_cleaned, status)
       VALUES ($1, NOW(), NULL, $2, $3)
       RETURNING *`,
      [1, beach_name, 'in_progress']
    );

    res.json({
      success: true,
      message: 'Robot started',
      session: result.rows[0]
    });
  } catch (error) {
    console.error('Error starting robot:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
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

module.exports = router;