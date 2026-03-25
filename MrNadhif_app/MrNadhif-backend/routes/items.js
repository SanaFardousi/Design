const express = require('express');
const router = express.Router();
const pool = require('../config/db');


// POST /api/items/log
// Used to insert a new detected item into the database
router.post('/log', async (req, res) => {
  try {
    const { category, location_lat, location_lng, image_url, status, session_id } = req.body;

    const result = await pool.query(
      `INSERT INTO item_records (
        session_id,
        category,
        timestamp,
        location_lat,
        location_lng,
        image_url,
        status
      )
       VALUES ($1, $2, NOW(), $3, $4, $5, $6)
       RETURNING *`,
      [
        session_id || null,
        category,
        location_lat !== undefined ? location_lat : null,
        location_lng !== undefined ? location_lng : null,
        image_url || null,
        status || 'pending'
      ]
    );

    res.json({
      success: true,
      record: result.rows[0]
    });

  } catch (error) {
    console.error('Error logging item:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});


// GET /api/items/valuables
// Returns valuable items for the Lost & Found screen
router.get('/valuables', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         ir.item_id,
         ir.session_id,
         ir.category,
         ir.timestamp,
         ir.location_lat,
         ir.location_lng,
         ir.image_url,
         ir.status,
         cs.beach_cleaned
       FROM item_records ir
       LEFT JOIN cleaning_sessions cs
         ON ir.session_id = cs.session_id
       WHERE LOWER(ir.category) IN ('sunglasses', 'watches', 'wallets', 'keys')
       ORDER BY ir.timestamp DESC`
    );

    res.json({
      success: true,
      items: result.rows
    });

  } catch (error) {
    console.error('Error fetching valuables:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

module.exports = router;