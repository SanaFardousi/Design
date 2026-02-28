const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const pool = require('../config/db');

// Configure storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/images/') // Save to uploads/images folder
  },
  filename: function (req, file, cb) {
    // Generate unique filename
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

const upload = multer({ storage: storage });

// Upload image endpoint
router.post('/image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        message: 'No image uploaded' 
      });
    }

    const imageUrl = `/uploads/images/${req.file.filename}`;
    const { category, session_id, confidence } = req.body;

    // Save to database
    const result = await pool.query(
      'INSERT INTO item_record (session_id, category, image_url, confidence) VALUES ($1, $2, $3, $4) RETURNING *',
      [session_id || 1, category, imageUrl, confidence || 95.0]
    );

    res.json({
      success: true,
      message: 'Image uploaded successfully',
      item: result.rows[0]
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
});

module.exports = router;
