// routes/notifications.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// GET /api/notifications
// Returns latest notifications for dashboard
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT notification_id, type, timestamp, session_id, message
      FROM notifications
      ORDER BY timestamp DESC
      LIMIT 10
    `);

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

module.exports = router;