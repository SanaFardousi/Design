// routes/notifications.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const robotAuth = require('../middleware/robotAuth');

// GET /api/notifications  (frontend polls this)
router.get('/', async (req, res) => {
  try {
    const activeSession = await pool.query(
      `SELECT session_id
       FROM cleaning_sessions
       WHERE robot_id = $1 AND status IN ('in_progress', 'paused')
       ORDER BY start_time DESC
       LIMIT 1`,
      [1]
    );

    if (activeSession.rows.length === 0) {
      return res.json({
        success: true,
        notifications: []
      });
    }

    const sessionId = activeSession.rows[0].session_id;

    const result = await pool.query(
      `SELECT notification_id, type, timestamp, session_id, message
       FROM notifications
       WHERE session_id = $1
       ORDER BY timestamp DESC
       LIMIT 10`,
      [sessionId]
    );

    res.json({
      success: true,
      notifications: result.rows
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notifications'
    });
  }
});

// POST /api/notifications  (Pi-only)
router.post('/', robotAuth, async (req, res) => {
  try {
    const { type, message } = req.body;

    const activeSession = await pool.query(
      `SELECT session_id FROM cleaning_sessions
       WHERE robot_id = $1 AND status IN ('in_progress', 'paused')
       ORDER BY start_time DESC LIMIT 1`,
      [1]
    );

    const sessionId = activeSession.rows[0]?.session_id || null;

    await pool.query(
      `INSERT INTO notifications (type, timestamp, session_id, message)
       VALUES ($1, NOW(), $2, $3)`,
      [type, sessionId, message]
    );

    res.json({ success: true });

  } catch (error) {
    console.error('Error inserting notification:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;