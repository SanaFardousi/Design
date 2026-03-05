// Import the Express framework (used to build the backend server and APIs)
const express = require('express');

// Create a router object to define API routes separately from the main server file
const router = express.Router();

// Import bcrypt library used to securely compare hashed passwords
const bcrypt = require('bcrypt');

// Import jsonwebtoken library used to create authentication tokens (JWT)
const jwt = require('jsonwebtoken');

// Import the database connection pool (PostgreSQL connection setup)
const pool = require('../config/db');


// Create a POST API endpoint for login
// This means the frontend will send login data to /api/auth/login
router.post('/login', async (req, res) => {

  try {

    // Extract email and password sent from the frontend request body
    const { email, password } = req.body;


    // Check if the user provided both email and password
    // If either is missing, return a 400 (Bad Request) response
    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email and password are required' 
      });
    }


    // Query the database to find a user with the provided email
    // $1 is a parameter placeholder used to prevent SQL injection
    const result = await pool.query(
      'SELECT * FROM admin_users WHERE email = $1',
      [email]
    );


    // If no user is found with that email
    if (result.rows.length === 0) {

      // Return 401 Unauthorized response
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid email or password' 
      });
    }


    // Store the found user record
    const user = result.rows[0];


    // Compare the password entered by the user with the hashed password in the database
    // bcrypt.compare hashes the input password and checks if it matches
    const validPassword = await bcrypt.compare(password, user.password_hash);


    // If password does not match
    if (!validPassword) {

      // Return authentication error
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid email or password' 
      });
    }


    // If email and password are correct, generate a JWT authentication token
    const token = jwt.sign(

      // Payload: data stored inside the token
      { id: user.id, email: user.email },

      // Secret key used to sign the token (stored in environment variables)
      process.env.JWT_SECRET,

      // Token expiration time
      { expiresIn: '24h' }
    );


    // Send successful login response back to the frontend
    res.json({

      // Indicates login was successful
      success: true,

      // Message to show on frontend
      message: 'Login successful',

      // Send the generated JWT token to the frontend
      token: token,

      // Send basic user info (without password)
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      }
    });

  } catch (error) {

    // If any unexpected error happens (database error, server crash, etc.)
    console.error('Login error:', error);

    // Send internal server error response
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
});


// Export this router so it can be used in the main server file (e.g., app.js)
module.exports = router;
