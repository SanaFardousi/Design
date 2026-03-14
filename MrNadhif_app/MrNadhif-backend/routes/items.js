router.post('/log', async (req, res) => {
  try {
    const { category, location_lat, location_lng } = req.body;

    const result = await pool.query(
      `INSERT INTO item_records (category, location_lat, location_lng)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [category, location_lat, location_lng]
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