// utils/createAlert.js
const pool = require('../config/db');
const sendSmsAlert = require('./sendSmsAlert');

const createAlert = async ({ type, sessionId = null, message }) => {
  try {
    // Prevent immediate duplicate alerts
    const lastNotification = await pool.query(
      `SELECT type, message
       FROM notifications
       WHERE session_id IS NOT DISTINCT FROM $1
       ORDER BY timestamp DESC
       LIMIT 1`,
      [sessionId]
    );

    const isDuplicate =
      lastNotification.rows.length > 0 &&
      lastNotification.rows[0].type === type &&
      lastNotification.rows[0].message === message;

    if (isDuplicate) {
      return { success: true, skipped: true };
    }

    // Insert notification into DB
    const result = await pool.query(
      `INSERT INTO notifications (type, timestamp, session_id, message)
       VALUES ($1, NOW(), $2, $3)
       RETURNING *`,
      [type, sessionId, message]
    );

    // Send SMS
    await sendSmsAlert(message);

    return { success: true, notification: result.rows[0] };

  } catch (error) {
    console.error('createAlert error:', error.message);
    return { success: false, error: error.message };
  }
};

module.exports = createAlert;