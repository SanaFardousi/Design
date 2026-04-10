// routes/bins.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const createAlert = require('../utils/createAlert');

// helper: get active session
const getActiveSession = async (robotId = 1) => {
  const result = await pool.query(
    `SELECT session_id FROM cleaning_sessions
     WHERE robot_id = $1 AND status IN ('in_progress', 'paused')
     ORDER BY start_time DESC LIMIT 1`,
    [robotId]
  );
  return result.rows[0] || null;
};

// GET /api/bins
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT bin_id, label, is_full, updated_at
       FROM bin_status ORDER BY bin_id`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch bin status' });
  }
});

// POST /api/bins/status
// Pi sends: { "bins": [{ "id": 1, "full": true }, ...] }
router.post('/status', async (req, res) => {
  const { bins } = req.body;

  if (!bins || !Array.isArray(bins)) {
    return res.status(400).json({
      error: 'Invalid payload. Expected { bins: [{ id, full }] }'
    });
  }

  try {
    const activeSession = await getActiveSession(1);

    for (const bin of bins) {
      // Get old status before updating
      const oldResult = await pool.query(
        `SELECT is_full, label FROM bin_status WHERE bin_id = $1`,
        [bin.id]
      );
      const oldBin = oldResult.rows[0];

      // Update bin
      await pool.query(
        `UPDATE bin_status SET is_full = $1, updated_at = NOW() WHERE bin_id = $2`,
        [bin.full, bin.id]
      );

      // Alert only when bin CHANGES from not full → full
      if (oldBin && oldBin.is_full === false && bin.full === true) {
        await createAlert({
          type: 'bin_full',
          sessionId: activeSession ? activeSession.session_id : null,
          message: `${oldBin.label} bin is full`
        });
      }
    }

    res.json({ success: true, updated: bins.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update bin status' });
  }
});

module.exports = router;