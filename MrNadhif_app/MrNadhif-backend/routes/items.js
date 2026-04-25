// routes/items.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const createAlert = require('../utils/createAlert');
const robotAuth = require('../middleware/robotAuth');

const getActiveSession = async (robotId = 1) => {
  const result = await pool.query(
    `SELECT session_id, beach_cleaned, status, start_time
     FROM cleaning_sessions
     WHERE robot_id = $1 AND status IN ('in_progress', 'paused')
     ORDER BY start_time DESC LIMIT 1`,
    [robotId]
  );
  return result.rows[0] || null;
};

// POST /api/items/log  (Pi-only)
router.post('/log', robotAuth, async (req, res) => {
  try {
    let { category, location_lat, location_lng, image_url, status, session_id } = req.body;

    if (!category) {
      return res.status(400).json({ success: false, message: 'category is required' });
    }

    if (!session_id) {
      const activeSession = await getActiveSession(1);
      session_id = activeSession ? activeSession.session_id : null;
    }

    if (!session_id) {
      return res.status(400).json({
        success: false,
        message: 'No active cleaning session found for this item'
      });
    }

    const result = await pool.query(
      `INSERT INTO item_records (session_id, category, timestamp, location_lat, location_lng, image_url, status)
       VALUES ($1, $2, NOW(), $3, $4, $5, $6)
       RETURNING *`,
      [
        session_id,
        category,
        location_lat !== undefined ? location_lat : null,
        location_lng !== undefined ? location_lng : null,
        image_url || null,
        status || 'pending'
      ]
    );

    const insertedItem = result.rows[0];
    const normalizedCategory = String(insertedItem.category).toLowerCase();
    const valuableCategories = ['sunglasses', 'watches', 'wallets', 'keys', 'valuable'];
    
    if (valuableCategories.includes(normalizedCategory)) {
      await createAlert({
        type: 'valuable_item_found',
        sessionId: insertedItem.session_id,
        message: `${insertedItem.category} detected and added to lost & found`
      });
    }

    res.json({ success: true, record: insertedItem });
  } catch (error) {
    console.error('Error logging item:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/items/valuables  (frontend)
router.get('/valuables', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ir.item_id, ir.session_id, ir.category, ir.timestamp,
              ir.location_lat, ir.location_lng, ir.image_url, ir.status,
              cs.beach_cleaned
       FROM item_records ir
       LEFT JOIN cleaning_sessions cs ON ir.session_id = cs.session_id
       WHERE LOWER(ir.category) IN ('sunglasses', 'watches', 'wallets', 'keys')
       ORDER BY ir.timestamp DESC`
    );
    res.json({ success: true, items: result.rows });
  } catch (error) {
    console.error('Error fetching valuables:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PUT /api/items/:itemId/status  (frontend)
router.put('/:itemId/status', async (req, res) => {
  try {
    const { itemId } = req.params;
    const { status } = req.body;
    const allowedStatuses = ['pending', 'stored', 'claimed'];

    if (!allowedStatuses.includes(String(status).toLowerCase())) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const result = await pool.query(
      `UPDATE item_records SET status = $1 WHERE item_id = $2 RETURNING *`,
      [status.toLowerCase(), itemId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Item not found' });
    }

    res.json({ success: true, item: result.rows[0] });
  } catch (error) {
    console.error('Error updating item status:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;