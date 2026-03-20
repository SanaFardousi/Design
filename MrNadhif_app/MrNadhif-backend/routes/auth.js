// Import Express framework to create API routes
const express = require('express');

// Create a router instance to define routes in this file
const router = express.Router();

// Import bcrypt to securely compare hashed passwords
const bcrypt = require('bcrypt');

// Import JSON Web Token library to generate authentication tokens
const jwt = require('jsonwebtoken');

// Import PostgreSQL database connection pool
const pool = require('../config/db');


// POST /api/auth/login
// This route handles admin login
router.post('/login', async (req, res) => {

  try {

    // Extract email and password from the request body
    const { email, password } = req.body;


    // Validate that both email and password were provided
    if (!email || !password) {

      // Return HTTP 400 if missing data
      return res.status(400).json({ 
        success: false, 
        message: 'Email and password are required' 
      });
    }


    // Query the database to find a user with the given email
    const result = await pool.query(
      'SELECT * FROM admin_users WHERE email = $1',
      [email] // parameterized query to prevent SQL injection
    );


    // If no user exists with this email
    if (result.rows.length === 0) {

      // Return unauthorized response
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid email or password' 
      });
    }


    // Extract the user record from the database result
    const user = result.rows[0];


    // Compare the entered password with the hashed password stored in the database
    const validPassword = await bcrypt.compare(password, user.password_hash);


    // If the password does not match
    if (!validPassword) {

      // Return unauthorized response
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid email or password' 
      });
    }


    // Generate a JWT authentication token
    const token = jwt.sign(

      // Payload stored inside the token
      { id: user.id, email: user.email },

      // Secret key used to sign the token (stored in environment variables)
      process.env.JWT_SECRET,

      // Token expiration time
      { expiresIn: '24h' }
    );


    // Send successful login response
    res.json({

      success: true,

      message: 'Login successful',

      // Return the generated authentication token
      token: token,

      // Send basic user information
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      }
    });


  } catch (error) {

    // Print any server error to the console
    console.error('Login error:', error);

    // Send a server error response
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
});


module.exports = router;