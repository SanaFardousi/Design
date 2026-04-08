const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  ssl: { rejectUnauthorized: false }, // ✅ required for Supabase
  max: 10,
  idleTimeoutMillis: 30000,           // drop idle connections after 30s
  connectionTimeoutMillis: 10000,     // timeout if can't connect in 10s
});

// ✅ This prevents the crash — handles dropped connections silently
pool.on('error', (err) => {
  console.error('Unexpected DB pool error (safe to ignore):', err.message);
});

// Test connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('Error connecting to database:', err.stack);
  } else {
    console.log('Connected to PostgreSQL database');
    release();
  }
});

module.exports = pool;