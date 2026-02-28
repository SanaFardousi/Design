import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './DashboardScreen.css';

function DashboardScreen() {
  const navigate = useNavigate();
  const [userEmail, setUserEmail] = useState('');

  useEffect(() => {
    // Check if user is logged in
    const isLoggedIn = localStorage.getItem('isLoggedIn');
    const email = localStorage.getItem('userEmail');
    
    if (!isLoggedIn) {
      // If not logged in, redirect to login page
      navigate('/');
    } else {
      setUserEmail(email);
    }
  }, [navigate]);

  const handleLogout = () => {
    // Clear login data
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('userEmail');
    
    // Go back to login
    navigate('/');
  };

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <div className="header-title">Mr.nadhif Dashboard</div>
        <button className="settings-button">⚙️</button>
      </div>

      {/* Welcome Message */}
      <div className="welcome-banner">
        Welcome, {userEmail}!
      </div>

      {/* Operational Alerts */}
      <div className="section">
        <h2 className="section-title">Operational Alerts</h2>
        
        <div className="alert-item">
          <div className="alert-icon blue">▶️</div>
          <div className="alert-content">
            <div className="alert-heading">Operation Started</div>
            <div className="alert-text">Cleaning operation started</div>
            <div className="alert-time">10:05 AM</div>
          </div>
        </div>

        <div className="alert-item">
          <div className="alert-icon blue">⚠️</div>
          <div className="alert-content">
            <div className="alert-heading">Obstacle Detected</div>
            <div className="alert-text">Obstacle detected, path recalculated</div>
            <div className="alert-time">10:15 AM</div>
          </div>
        </div>

        <div className="alert-item">
          <div className="alert-icon blue">🔋</div>
          <div className="alert-content">
            <div className="alert-heading">Low Battery</div>
            <div className="alert-text">Battery low: Robot requires charging soon</div>
            <div className="alert-time">10:30 AM</div>
          </div>
        </div>
      </div>

      {/* Robot Activity Log */}
      <div className="section">
        <h2 className="section-title">Robot Activity Log</h2>
        
        <div className="activity-timeline">
          <div className="activity-item">
            <div className="activity-icon">▶️</div>
            <div className="activity-line"></div>
            <div className="activity-content">
              <div className="activity-heading">Cleaning Started</div>
              <div className="activity-time">10:00 AM</div>
            </div>
          </div>

          <div className="activity-item">
            <div className="activity-icon">⏸️</div>
            <div className="activity-line"></div>
            <div className="activity-content">
              <div className="activity-heading">Cleaning Paused</div>
              <div className="activity-time">10:20 AM</div>
            </div>
          </div>

          <div className="activity-item">
            <div className="activity-icon">⚠️</div>
            <div className="activity-content">
              <div className="activity-heading">Cleaning Started</div>
              <div className="activity-time">11:00 AM</div>
            </div>
          </div>
        </div>
      </div>

      {/* Current Status Overview */}
      <div className="section">
        <h2 className="section-title">Current Status Overview</h2>
        
        <div className="status-item">
          <div className="status-left">
            <div className="status-label">Battery Level</div>
            <div className="status-sublabel">Estimated 3 hours remaining on current load</div>
          </div>
          <div className="status-value">85%</div>
        </div>

        <div className="status-item">
          <div className="status-left">
            <div className="status-label">Plastic Bin</div>
            <div className="status-sublabel">Next emptying due in 2-3 cycles</div>
          </div>
          <div className="status-value full">Full</div>
        </div>

        <div className="status-item">
          <div className="status-left">
            <div className="status-label">Metal Bin</div>
            <div className="status-sublabel">Last emptied: 12:45 PM, Capacity: 5.0 L</div>
          </div>
          <div className="status-value">Not Full</div>
        </div>


        <div className="status-item">
          <div className="status-left">
            <div className="status-label">Valuables Bin</div>
            <div className="status-sublabel">Last emptied: 12:45 PM, Capacity: 5.0 L</div>
          </div>
          <div className="status-value">Not Full</div>
        </div>
      </div>

      {/* Logout Button */}
      <div className="logout-container">
        <button onClick={handleLogout} className="logout-button">
          Logout
        </button>
      </div>

      {/* Bottom Navigation */}
      <div className="bottom-nav">
        <div className="nav-item active">
          <div className="nav-icon">🏠</div>
          <div className="nav-label">Home</div>
        </div>
          <div className="nav-item" onClick={() => navigate('/reports')}>
          <div className="nav-icon">📊</div>
          <div className="nav-label">Reports</div>
        </div>
        <div className="nav-item" onClick={() => navigate('/robot-control')}>
          <div className="nav-icon">🎮</div>
          <div className="nav-label">Robot Control</div>
        </div>
        <div className="nav-item" onClick={() => navigate('/valuables')}>
          <div className="nav-icon">🔍</div>
          <div className="nav-label">Lost & Found</div>
        </div>
      </div>
    </div>
  );
}

export default DashboardScreen;