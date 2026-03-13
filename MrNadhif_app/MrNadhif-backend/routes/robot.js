const express = require('express');
const router = express.Router();
const pool = require('../config/db');

router.get('/status', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM robots WHERE robot_id = $1', [1]);

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Robot not found' 
      });
    }

    res.json({
      success: true,
      robot: result.rows[0]
    });

  } catch (error) {
    console.error('Error fetching robot status:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
});

router.post('/update-status', async (req, res) => {
  try {
    const { status, battery_level } = req.body;

    const result = await pool.query(
      'UPDATE robots SET status = $1, last_maintenance = NOW() WHERE robot_id = $2 RETURNING *',
      [status, 1]
    );

    res.json({
      success: true,
      robot: result.rows[0]
    });

  } catch (error) {
    console.error('Error updating robot:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
});

router.post('/start', async (req, res) => {
  try {
    const { beach_name } = req.body;

    await pool.query("UPDATE robots SET status = 'cleaning' WHERE robot_id = $1", [1]);

    const result = await pool.query(
      'INSERT INTO cleaning_sessions (robot_id, beach_cleaned, status) VALUES ($1, $2, $3) RETURNING *',
      [1, beach_name, 'in_progress']
    );

    res.json({
      success: true,
      message: 'Robot started',
      session: result.rows[0]
    });

  } catch (error) {
    console.error('Error starting robot:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
});

router.post('/stop', async (req, res) => {
  try {
    await pool.query("UPDATE robots SET status = 'idle' WHERE robot_id = $1", [1]);

    await pool.query(
      "UPDATE cleaning_sessions SET status = 'completed', end_time = NOW() WHERE robot_id = $1 AND status = 'in_progress'",
      [1]
    );

    res.json({
      success: true,
      message: 'Robot stopped'
    });

  } catch (error) {
    console.error('Error stopping robot:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
});

router.post('/obstacle/detected', async (req, res) => {
  try {
    await pool.query(
      "UPDATE robots SET status = 'obstacle' WHERE robot_id = $1",
      [1]);
    
    res.json({
      success: true,
      message: 'Obstacle detected'
    });

  } catch (error) {
    console.error('Error updating obstacle status:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

router.post('/obstacle/cleared', async (req, res) => {
  try {
    await pool.query(
      "UPDATE robots SET status = 'cleaning' WHERE robot_id = $1",
      [1]);
    
    res.json({
      success: true,
      message: 'Obstacle cleared'
    });

  } catch (error) {
    console.error('Error clearing obstacle status:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

module.exports = router;