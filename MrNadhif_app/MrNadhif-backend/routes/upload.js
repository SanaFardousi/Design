// routes/upload.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');

// Configure storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, '../MrNadhif-frontend/public/valuables/');
  },
  filename: function (req, file, cb) {
    // Generate unique filename
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

const upload = multer({ storage: storage });

// Upload image endpoint
// NOTE: This route ONLY saves the file and returns the URL.
// The Pi should then call POST /api/items/log with that image_url
// so item_records gets exactly one properly-scoped row per detection.
router.post('/image', upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image uploaded'
      });
    }

    const imageUrl = `/valuables/${req.file.filename}`;

    res.json({
      success: true,
      message: 'Image uploaded successfully',
      image_url: imageUrl
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