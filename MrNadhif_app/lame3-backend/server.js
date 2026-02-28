const express = require('express');
const cors = require('cors');
require('dotenv').config();

// Import routes
const authRoutes = require('./routes/auth');
const robotRoutes = require('./routes/robot');
const reportsRoutes = require('./routes/reports');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/robot', robotRoutes);
app.use('/api/reports', reportsRoutes);

// Test route
app.get('/', (req, res) => {
  res.json({ 
    message: 'LAME3 Backend Server is running! 🤖',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth/login',
      robot: '/api/robot/status',
      reports: '/api/reports/summary'
    }
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Database: ${process.env.DB_NAME}`);
});