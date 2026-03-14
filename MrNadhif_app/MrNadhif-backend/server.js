const express = require('express');
const cors = require('cors');
require('dotenv').config();

// Import routes
const authRoutes = require('./routes/auth');
const robotRoutes = require('./routes/robot');
const reportsRoutes = require('./routes/reports');
const binsRouter = require('./routes/bins');
const itemsRoutes = require('./routes/items');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

//  Robot API key middleware
const robotAuth = (req, res, next) => {
  const key = req.headers['x-api-key'];
  if (key && key === process.env.ROBOT_API_KEY) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized: Invalid or missing API key' });
  }
};

// Routes
app.use('/api/auth', authRoutes);               //  No key (app login)
app.use('/api/robot', robotAuth, robotRoutes);  //  Pi protected
app.use('/api/reports', reportsRoutes);         //  No key (app reads)
app.use('/api/bins', robotAuth, binsRouter);    //  Pi protected
app.use('/api/items', robotAuth, itemsRoutes);  //  Pi protected

// Test route
app.get('/', (req, res) => {
  res.json({ 
    message: 'LAME3 Backend Server is running! ',
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