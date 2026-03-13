const express = require('express');
const router  = express.Router();
const pool    = require('../config/db');

// ── Helper: get the current active session ID ─
const ACTIVE_SESSION = `
  SELECT session_id 
  FROM cleaning_sessions 
  WHERE status = 'in_progress' 
  ORDER BY start_time DESC 
  LIMIT 1
`;

// ─────────────────────────────────────────────
//  METAL BIN
// ─────────────────────────────────────────────

router.post('/metal/inserted', async (req, res) => {
  try {
    await pool.query(
      `INSERT INTO item_records (session_id, category) 
       VALUES ((${ACTIVE_SESSION}), 'metal')`
    );

    res.json({ 
      success: true, 
      message: 'Metal item recorded' 
    });

  } catch (error) {
    console.error('Error recording metal item:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
});

router.post('/metal/full', async (req, res) => {
  try {
    await pool.query(
      "UPDATE robots SET status = 'metal_bin_full' WHERE robot_id = $1",
      [1]
    );

    res.json({ 
      success: true, 
      message: 'Metal bin marked full' 
    });

  } catch (error) {
    console.error('Error updating metal bin status:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
});

// ─────────────────────────────────────────────
//  PLASTIC BIN
// ─────────────────────────────────────────────

router.post('/plastic/inserted', async (req, res) => {
  try {
    await pool.query(
      `INSERT INTO item_records (session_id, category) 
       VALUES ((${ACTIVE_SESSION}), 'plastic')`
    );

    res.json({ 
      success: true, 
      message: 'Plastic item recorded' 
    });

  } catch (error) {
    console.error('Error recording plastic item:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
});

router.post('/plastic/full', async (req, res) => {
  try {
    await pool.query(
      "UPDATE robots SET status = 'plastic_bin_full' WHERE robot_id = $1",
      [1]
    );

    res.json({ 
      success: true, 
      message: 'Plastic bin marked full' 
    });

  } catch (error) {
    console.error('Error updating plastic bin status:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
});

module.exports = router;