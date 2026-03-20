
const express = require('express');

const router = express.Router();

const pool = require('../config/db'); 

// GET /api/bins
// This route returns the status of all bins from the database
router.get('/', async (req, res) => {
  try {
    // Run a SQL query to get bin id, label, full status, and last update time
    const result = await pool.query(
      `SELECT bin_id, label, is_full, updated_at 
       FROM bin_status 
       ORDER BY bin_id`
    );

    // Send the query result back to the client as JSON
    res.json(result.rows);
  } catch (err) {
    console.error(err);

    // Send an HTTP 500 error response to the client
    res.status(500).json({ error: 'Failed to fetch bin status' });
  }
});


// POST /api/bins/status
// This route is called by the Raspberry Pi to update the status of bins
router.post('/status', async (req, res) => {
  // Extract the bins array from the JSON request body
  const { bins } = req.body;

  // Validate that bins exists and is an array
  if (!bins || !Array.isArray(bins)) {
    return res.status(400).json({ error: 'Invalid payload. Expected { bins: [...] }' });
  }

  try {
    // Loop through each bin object sent from the Raspberry Pi
    for (const bin of bins) {
      // Update the matching bin in the database
      await pool.query(
        `UPDATE bin_status SET is_full = $1, updated_at = NOW() WHERE bin_id = $2`,
        [bin.full, bin.id]
      );
    }

    // Send success response after updating all bins
    res.json({ success: true, updated: bins.length });
  } catch (err) {
    console.error(err);

    res.status(500).json({ error: 'Failed to update bin status' });
  }
});


module.exports = router;