import React from 'react';
import { useNavigate } from 'react-router-dom';
import './Settingsscreen.css';

function SettingsScreen() {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('userEmail');
    navigate('/');
  };

  return (
    <div className="set-container">
      {/* Header */}
      <div className="set-header">
        <div className="set-header-title">Settings</div>
        <button className="set-settings-btn">⚙️</button>
      </div>

      {/* Account Section */}
      <div className="set-section">
        <div className="set-section-title">Account</div>

        <div className="set-item" onClick={() => alert('Profile page coming soon')}>
          <span className="set-item-label">Profile</span>
          <div className="set-arrow-btn">→</div>
        </div>
        <div className="set-item" onClick={() => alert('Change password coming soon')}>
          <span className="set-item-label">Change Password</span>
          <div className="set-arrow-btn">→</div>
        </div>
        <div className="set-item" onClick={() => alert('Change email coming soon')}>
          <span className="set-item-label">Change Email</span>
          <div className="set-arrow-btn">→</div>
        </div>
      </div>

      {/* Help & Support Section */}
      <div className="set-section">
        <div className="set-section-title">Help &amp; Support</div>

        <div className="set-link-item" onClick={() => alert('FAQs coming soon')}>FAQs</div>
        <div className="set-link-item" onClick={() => alert('Contact Support coming soon')}>Contact Support</div>
        <div className="set-link-item" onClick={() => alert('User Manual coming soon')}>User Manual</div>
      </div>

      {/* Logout */}
      <div className="set-logout-wrapper">
        <button className="set-logout-btn" onClick={handleLogout}>Logout</button>
      </div>

      {/* Bottom Navigation */}
      <div className="bottom-nav">
        <div className="nav-item" onClick={() => navigate('/dashboard')}>
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

export default SettingsScreen;