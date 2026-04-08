// server.js
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

app.use(cors());
app.use(express.json());

// ROBOT API KEY MIDDLEWARE
// 
const robotAuth = (req, res, next) => {
  const key = req.headers['x-api-key'];
  if (key && key === process.env.ROBOT_API_KEY) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized: Invalid or missing API key' });
  }
};

// 
// SCHEDULE WORKER
// Checks every 30s for due schedules
// Survives restarts because state is in DB

const checkScheduledCleanings = async () => {
  const client = await pool.connect();
  try {
    const dueSchedules = await client.query(
      `SELECT schedule_id, robot_id, beach_name, start_time
       FROM cleaning_schedules
       WHERE status = 'pending'
         AND start_time <= NOW()
       ORDER BY start_time ASC
       FOR UPDATE SKIP LOCKED`
    );

    //  no early client.release() — finally block handles it always
    if (dueSchedules.rows.length === 0) {
      return;
    }

    console.log(`[Worker] Found ${dueSchedules.rows.length} due schedule(s)`);

    for (const schedule of dueSchedules.rows) {
      await client.query('BEGIN');
      try {
        // Skip if robot already has an active session
        const activeCheck = await client.query(
          `SELECT session_id FROM cleaning_sessions
           WHERE robot_id = $1 AND status IN ('in_progress', 'paused')
           LIMIT 1`,
          [schedule.robot_id]
        );

        if (activeCheck.rows.length > 0) {
          await client.query('ROLLBACK');
          console.log(`[Worker] Robot ${schedule.robot_id} is busy, skipping`);
          continue;
        }

        // 1. Create cleaning session
        const sessionResult = await client.query(
          `INSERT INTO cleaning_sessions (robot_id, start_time, end_time, beach_cleaned, status)
           VALUES ($1, NOW(), NULL, $2, 'in_progress')
           RETURNING *`,
          [schedule.robot_id, schedule.beach_name]
        );
        const session = sessionResult.rows[0];

        // 2. Update robot status
        await client.query(
          `UPDATE robots SET status = 'cleaning' WHERE robot_id = $1`,
          [schedule.robot_id]
        );

        // 3. Mark schedule as started and link session_id
        await client.query(
          `UPDATE cleaning_schedules
           SET status = 'started', started_at = NOW(), session_id = $1
           WHERE schedule_id = $2`,
          [session.session_id, schedule.schedule_id]
        );

        // 4. Write command to DB so Pi can poll it
        await client.query(
          `INSERT INTO robot_commands
             (robot_id, schedule_id, session_id, command_type, payload, status)
           VALUES ($1, $2, $3, 'start_cleaning', $4, 'pending')`,
          [
            schedule.robot_id,
            schedule.schedule_id,
            session.session_id,
            JSON.stringify({
              beach_name: schedule.beach_name,
              session_id: session.session_id
            })
          ]
        );

        await client.query('COMMIT');
        console.log(`[Worker]  Schedule ${schedule.schedule_id} → Session ${session.session_id} started`);

      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[Worker]  Failed schedule ${schedule.schedule_id}:`, err.message);
      }
    }

  } catch (err) {
    console.error('[Worker] Fatal error:', err.message);
  } finally {
    client.release(); //  called ONCE, always, no matter what
  }
};

// Run immediately on startup then every 30 seconds
checkScheduledCleanings();
setInterval(checkScheduledCleanings, 30000);

// ROUTES
app.use('/api/auth', authRoutes);
app.use('/api/robot', robotRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/bins', binsRouter);
app.use('/api/items', itemsRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/notifications', notificationsRoutes);

// PI POLLING ROUTES

// Pi asks: "do you have a command for me?"
app.get('/api/robot/next-command', robotAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM robot_commands
       WHERE robot_id = $1 AND status = 'pending'
       ORDER BY created_at ASC
       LIMIT 1`,
      [1]
    );
    const command = result.rows[0] || null;
    res.json({ success: true, command });
  } catch (err) {
    console.error('[next-command] Error:', err.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Pi says: "I got the command and I am starting"
app.post('/api/robot/acknowledge-command', robotAuth, async (req, res) => {
  const { command_id } = req.body;
  if (!command_id) {
    return res.status(400).json({ success: false, error: 'command_id required' });
  }
  try {
    await pool.query(
      `UPDATE robot_commands
       SET status = 'acknowledged', acknowledged_at = NOW()
       WHERE command_id = $1 AND status = 'pending'`,
      [command_id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[acknowledge-command] Error:', err.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Test route
app.get('/', (req, res) => {
  res.json({ message: 'LAME3 Backend running', version: '1.0.0' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Database: ${process.env.DB_NAME}`);
});
