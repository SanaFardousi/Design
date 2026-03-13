// routes/bins.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db'); // adjust path if needed

// GET /api/bins — returns all bin statuses
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT bin_id, label, is_full, updated_at 
       FROM bin_status 
       ORDER BY bin_id`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch bin status' });
  }
});

// POST /api/bins/status — called by Raspberry Pi to update bin statuses
// Body: { "bins": [ { "id": 1, "full": true }, { "id": 2, "full": false }, ... ] }
router.post('/status', async (req, res) => {
  const { bins } = req.body;

  if (!bins || !Array.isArray(bins)) {
    return res.status(400).json({ error: 'Invalid payload. Expected { bins: [...] }' });
  }

  try {
    for (const bin of bins) {
      await pool.query(
        `UPDATE bin_status SET is_full = $1, updated_at = NOW() WHERE bin_id = $2`,
        [bin.full, bin.id]
      );
    }
    res.json({ success: true, updated: bins.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update bin status' });
  }
});

module.exports = router;