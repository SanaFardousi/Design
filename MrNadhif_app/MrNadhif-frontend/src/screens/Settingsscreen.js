import React from 'react';
import { useNavigate } from 'react-router-dom';
import './Settingsscreen.css';

// Import SVG icons from lucide-react for consistent UI across the app
import {
  Settings,
  ChevronRight,
  Home,
  BarChart2,
  Gamepad2,
  Search
} from 'lucide-react';

function SettingsScreen() {

  // Hook used to navigate between pages
  const navigate = useNavigate();

  // Logout function: clears login data from browser storage
  const handleLogout = () => {
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('userEmail');

    // Redirect user back to login screen
    navigate('/');
  };

  return (
    <div className="set-container">

      <div className="set-header">

        {/* Page title */}
        <div className="set-header-title">Settings</div>

        {/* Settings icon (replaces ⚙️ emoji) */}
        <button className="set-settings-btn">
          <Settings size={20} />
        </button>

      </div>


      <div className="set-section">

        <div className="set-section-title">Account</div>

        {/* Profile option */}
        <div
          className="set-item"
          onClick={() => alert('Profile page coming soon')}
        >
          <span className="set-item-label">Profile</span>

          {/* Arrow icon (replaces →) */}
          <div className="set-arrow-btn">
            <ChevronRight size={18} />
          </div>
        </div>

        {/* Change password option */}
        <div
          className="set-item"
          onClick={() => alert('Change password coming soon')}
        >
          <span className="set-item-label">Change Password</span>

          <div className="set-arrow-btn">
            <ChevronRight size={18} />
          </div>
        </div>

        {/* Change email option */}
        <div
          className="set-item"
          onClick={() => alert('Change email coming soon')}
        >
          <span className="set-item-label">Change Email</span>

          <div className="set-arrow-btn">
            <ChevronRight size={18} />
          </div>
        </div>

      </div>


      <div className="set-section">

        <div className="set-section-title">Help & Support</div>

        <div
          className="set-link-item"
          onClick={() => alert('FAQs coming soon')}
        >
          FAQs
        </div>

        <div
          className="set-link-item"
          onClick={() => alert('Contact Support coming soon')}
        >
          Contact Support
        </div>

        <div
          className="set-link-item"
          onClick={() => alert('User Manual coming soon')}
        >
          User Manual
        </div>

      </div>


      <div className="set-logout-wrapper">
        <button
          className="set-logout-btn"
          onClick={handleLogout}
        >
          Logout
        </button>
      </div>


      <div className="bottom-nav">

        {/* Home */}
        <div
          className="nav-item"
          onClick={() => navigate('/dashboard')}
        >
          <div className="nav-icon">
            <Home size={22} />
          </div>
          <div className="nav-label">Home</div>
        </div>

        {/* Reports */}
        <div
          className="nav-item"
          onClick={() => navigate('/reports')}
        >
          <div className="nav-icon">
            <BarChart2 size={22} />
          </div>
          <div className="nav-label">Reports</div>
        </div>

        {/* Robot Control */}
        <div
          className="nav-item"
          onClick={() => navigate('/robot-control')}
        >
          <div className="nav-icon">
            <Gamepad2 size={22} />
          </div>
          <div className="nav-label">Robot Control</div>
        </div>

        {/* Lost & Found */}
        <div
          className="nav-item"
          onClick={() => navigate('/valuables')}
        >
          <div className="nav-icon">
            <Search size={22} />
          </div>
          <div className="nav-label">Lost & Found</div>
        </div>

      </div>

    </div>
  );
}

export default SettingsScreen;