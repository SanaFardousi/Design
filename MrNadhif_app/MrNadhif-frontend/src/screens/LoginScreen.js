import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../services/api';
import './LoginScreen.css';

function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Call REAL backend API
      const response = await login(email, password);
      
      if (response.success) {
        // Save token and user info
        localStorage.setItem('token', response.token);
        localStorage.setItem('user', JSON.stringify(response.user));
        localStorage.setItem('userEmail', response.user.email);
        localStorage.setItem('isLoggedIn', 'true');
        
        console.log('Login successful!', response.user);
        
        // Navigate to dashboard
        navigate('/dashboard');
      } else {
        setError(response.message || 'Login failed');
      }
    } catch (err) {
      console.error('Login error:', err);
      
      // Check if backend is running
      if (err.code === 'ERR_NETWORK') {
        setError('Cannot connect to server. Make sure backend is running on port 5000!');
      } else {
        setError(err.response?.data?.message || 'Invalid email or password');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <h2 className="login-title">Log in</h2>
        
        {/* Robot Image */}
        <div className="robot-container">
          <div className="robot-bg-circle"></div>
          <img 
            src="/robot.jpeg" 
            alt="MrNadhif Robot" 
            className="robot-image"
          />
        </div>

        <h3 className="welcome-text">Welcome to MrNadhif!</h3>

        {/* Error Message */}
        {error && (
          <div className="error-message">
            {error}
          </div>
        )}


        {/* Login Form */}
        <form onSubmit={handleLogin}>
          <div className="input-group">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="input-field"
              disabled={loading}
            />
          </div>

          <div className="input-group">
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="input-field"
              disabled={loading}
            />
          </div>

          <div className="forgot-password">
            <a href="#forgot">Forgot password?</a>
          </div>

          <button 
            type="submit" 
            className="login-button"
            disabled={loading}
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>

        {/* Backend Status */}
        <div className="status-box">
          Backend: <span className="status-indicator">●</span> localhost:5000
        </div>
      </div>
    </div>
  );
}

export default LoginScreen;


