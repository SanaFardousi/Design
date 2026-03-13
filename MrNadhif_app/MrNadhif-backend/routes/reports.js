const express = require('express');
const router = express.Router();
const pool = require('../config/db');

router.get('/summary', async (req, res) => {
  try {
    const categoryCount = await pool.query(`
      SELECT category, COUNT(*) as count 
      FROM item_records 
      GROUP BY category
    `);

    const summary = {
      valuables: 0,
      plastic: 0,
      metal: 0,
      glass: 0,
      paper: 0,
      other: 0
    };

    categoryCount.rows.forEach(row => {
      if (row.category === 'valuable') {
        summary.valuables = parseInt(row.count);
      } else if (summary.hasOwnProperty(row.category)) {
        summary[row.category] = parseInt(row.count);
      }
    });

    summary.other = Object.values(summary).reduce((a, b) => a + b, 0);

    res.json({
      success: true,
      summary: summary
    });

  } catch (error) {
    console.error('Error fetching reports:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
});

router.get('/valuables', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT ir.*, cs.beach_cleaned 
      FROM item_records ir
      LEFT JOIN cleaning_sessions cs ON ir.session_id = cs.session_id
      WHERE ir.category = 'valuable'
      ORDER BY ir.timestamp DESC
    `);

    res.json({
      success: true,
      valuables: result.rows
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