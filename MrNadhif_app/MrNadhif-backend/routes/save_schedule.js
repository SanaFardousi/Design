router.post('/schedule', async (req, res) => { 
  try {
    const { beach_name, date, start_time } = req.body;

    if (!beach_name || !date || !start_time) {
      return res.status(400).json({
        success: false,
        message: 'Beach name, date, and start time are required'
      });
    }

    const fullStartTime = `${date} ${start_time}:00`;

    const geofence = JSON.stringify({});

    const result = await pool.query(
      `INSERT INTO cleaning_schedules 
       (robot_id, start_time, geofence_json, created_at, beach_name)
       VALUES ($1, $2, $3, $2, $4)
       RETURNING *`,
      [1, fullStartTime, geofence, beach_name]
    );

    res.json({
      success: true,
      message: 'Schedule saved successfully',
      schedule: result.rows[0]
    });

  } catch (error) {
    console.error('Error saving schedule:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});