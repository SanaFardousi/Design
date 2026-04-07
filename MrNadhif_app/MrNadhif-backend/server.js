const express = require('express');
const cors = require('cors');
require('dotenv').config();
const pool = require('./config/db');

// Import routes
const authRoutes = require('./routes/auth');
const robotRoutes = require('./routes/robot');
const reportsRoutes = require('./routes/reports');
const binsRouter = require('./routes/bins');
const itemsRoutes = require('./routes/items');
const uploadRoutes = require('./routes/upload');
const notificationsRoutes = require('./routes/notifications');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Robot API key middleware
const robotAuth = (req, res, next) => {
  const key = req.headers['x-api-key'];
  if (key && key === process.env.ROBOT_API_KEY) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized: Invalid or missing API key' });
  }
};

// ==========================================
// SIMPLE COMMAND QUEUE FOR PI POLLING
// ==========================================
let pendingRobotCommand = null;

// ==========================================
// SCHEDULE EXECUTOR
// Runs every 10 seconds
// ==========================================
const checkScheduledCleanings = async () => {
  const client = await pool.connect();

  try {
    const dueSchedules = await client.query(
      `SELECT schedule_id, robot_id, beach_name, start_time
       FROM cleaning_schedules
       WHERE status = 'pending'
         AND start_time <= NOW()
       ORDER BY start_time ASC`
    );

    if (dueSchedules.rows.length === 0) {
      client.release();
      return;
    }

    for (const schedule of dueSchedules.rows) {
      await client.query('BEGIN');

      // Check if robot already has an active session
      const activeSessionCheck = await client.query(
        `SELECT session_id
         FROM cleaning_sessions
         WHERE robot_id = $1 AND status IN ('in_progress', 'paused')
         ORDER BY start_time DESC
         LIMIT 1`,
        [schedule.robot_id]
      );

      if (activeSessionCheck.rows.length > 0) {
        // Robot busy -> skip this schedule for now
        await client.query('ROLLBACK');
        continue;
      }

      // Insert a real cleaning session
      const sessionResult = await client.query(
        `INSERT INTO cleaning_sessions (
           robot_id,
           start_time,
           end_time,
           beach_cleaned,
           status
         )
         VALUES ($1, NOW(), NULL, $2, $3)
         RETURNING *`,
        [schedule.robot_id, schedule.beach_name, 'in_progress']
      );

      const session = sessionResult.rows[0];

      // Update robot status
      await client.query(
        `UPDATE robots
         SET status = 'cleaning'
         WHERE robot_id = $1`,
        [schedule.robot_id]
      );

      // Mark schedule as started
      await client.query(
        `UPDATE cleaning_schedules
         SET status = 'started',
             started_at = NOW()
         WHERE schedule_id = $1`,
        [schedule.schedule_id]
      );

      await client.query('COMMIT');

      // Put command in queue for Pi polling
      pendingRobotCommand = {
        action: 'start',
        robot_id: schedule.robot_id,
        schedule_id: schedule.schedule_id,
        session_id: session.session_id,
        beach_name: schedule.beach_name,
        start_time: session.start_time
      };

      console.log(
        `Scheduled cleaning started: schedule ${schedule.schedule_id}, beach ${schedule.beach_name}, session ${session.session_id}`
      );
    }
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Rollback error:', rollbackError);
    }
    console.error('Error checking scheduled cleanings:', error);
  } finally {
    client.release();
  }
};

// Run worker every 10 seconds
setInterval(checkScheduledCleanings, 10000);

// Optional: also check once on startup
checkScheduledCleanings();

// ==========================================
// ROUTES
// ==========================================
app.use('/api/auth', authRoutes);
app.use('/api/robot', robotRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/bins', binsRouter);
app.use('/api/items', itemsRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/notifications', notificationsRoutes);

// ==========================================
// PI POLLING ROUTE
// Pi asks: "Do you have a command for me?"
// ==========================================
app.get('/api/robot/next-command', robotAuth, (req, res) => {
  if (!pendingRobotCommand) {
    return res.json({
      success: true,
      command: null
    });
  }

  const commandToSend = pendingRobotCommand;
  pendingRobotCommand = null; // clear after sending once

  res.json({
    success: true,
    command: commandToSend
  });
});

// Test route
app.get('/', (req, res) => {
  res.json({
    message: 'LAME3 Backend Server is running!',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth/login',
      robot: '/api/robot/status',
      reports: '/api/reports/summary',
      nextCommand: '/api/robot/next-command'
    }
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Database: ${process.env.DB_NAME}`);
});