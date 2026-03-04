// Import React and required hooks
import React, { useEffect, useState } from 'react';

// useNavigate allows programmatic navigation between routes
import { useNavigate } from 'react-router-dom';

// Import CSS styling for this screen
import './DashboardScreen.css';

// Import clean SVG icons from lucide-react
import {
  Settings,
  Play,
  AlertTriangle,
  BatteryLow,
  Home,
  BarChart2,
  Gamepad2,
  Search,
  Pause,
} from 'lucide-react';

function DashboardScreen() {

  // Hook used to redirect users to other pages
  const navigate = useNavigate();

  // State to store the logged-in user's email
  const [userEmail, setUserEmail] = useState('');

  /*
    useEffect runs once when the component loads.
    Purpose:
    - Check if the user is logged in.
    - If not logged in, then redirect to login page.
    - If logged in, then display their email.
  */
  useEffect(() => {

    // Get login data from localStorage
    const isLoggedIn = localStorage.getItem('isLoggedIn');
    const email = localStorage.getItem('userEmail');

    // If user is NOT logged in, then redirect to login page
    if (!isLoggedIn) {
      navigate('/');
    } else {
      // If logged in, then save email into state
      setUserEmail(email || '');
    }

  }, [navigate]); // dependency array

  /*
    Logout function:
    - Removes login info from localStorage
    - Redirects back to login page
  */

  const handleLogout = () => {
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('userEmail');
    navigate('/');
  };

  return (
    <div className="dashboard-container">

      {/*HEADER*/}
      <div className="dashboard-header">

        {/* Dashboard title */}
        <div className="header-title">
          Mr.Nadhif Dashboard
        </div>

        {/* Settings button with SVG icon */}
        <button className="settings-button" onClick={() => navigate('/settings')}>
          <Settings size={20} />
        </button>
      </div>


      {/*WELCOME BANNER */}
      <div className="welcome-banner">
        Welcome, {userEmail}!
      </div>


      {/*OPERATIONAL ALERTS*/}
      <div className="section">
        <h2 className="section-title">Operational Alerts</h2>

        {/* Alert 1 */}
        <div className="alert-item">
          <div className="alert-icon blue">
            <Play size={20} />
          </div>
          <div className="alert-content">
            <div className="alert-heading">Operation Started</div>
            <div className="alert-text">Cleaning operation started</div>
            <div className="alert-time">10:05 AM</div>
          </div>
        </div>

        {/* Alert 2 */}
        <div className="alert-item">
          <div className="alert-icon blue">
            <AlertTriangle size={20} />
          </div>
          <div className="alert-content">
            <div className="alert-heading">Obstacle Detected</div>
            <div className="alert-text">Obstacle detected, path recalculated</div>
            <div className="alert-time">10:15 AM</div>
          </div>
        </div>

        {/* Alert 3 */}
        <div className="alert-item">
          <div className="alert-icon blue">
            <BatteryLow size={20} />
          </div>
          <div className="alert-content">
            <div className="alert-heading">Low Battery</div>
            <div className="alert-text">
              Battery low: Robot requires charging soon
            </div>
            <div className="alert-time">10:30 AM</div>
          </div>
        </div>
      </div>


      {/*ACTIVITY LOG*/}
      <div className="section">
        <h2 className="section-title">Robot Activity Log</h2>

        <div className="activity-timeline">

          {/* Activity 1 */}
          <div className="activity-item">
            <div className="activity-icon">
              <Play size={18} />
            </div>
            <div className="activity-line"></div>
            <div className="activity-content">
              <div className="activity-heading">Cleaning Started</div>
              <div className="activity-time">10:00 AM</div>
            </div>
          </div>

          {/* Activity 2 */}
          <div className="activity-item">
            <div className="activity-icon">
              <Pause size={18} />
            </div>
            <div className="activity-line"></div>
            <div className="activity-content">
              <div className="activity-heading">Cleaning Paused</div>
              <div className="activity-time">10:20 AM</div>
            </div>
          </div>

          {/* Activity 3 */}
          <div className="activity-item">
            <div className="activity-icon">
              <AlertTriangle size={18} />
            </div>
            <div className="activity-content">
              <div className="activity-heading">Obstacle Detected</div>
              <div className="activity-time">11:00 AM</div>
            </div>
          </div>

        </div>
      </div>


      {/*STATUS OVERVIEW*/}
      <div className="section">
        <h2 className="section-title">Current Status Overview</h2>

        {/* Battery */}
        <div className="status-item">
          <div className="status-left">
            <div className="status-label">Battery Level</div>
            <div className="status-sublabel">
              Estimated 3 hours remaining
            </div>
          </div>
          <div className="status-value">70%</div>
        </div>

        

        {/* Plastic Bin */}
        <div className="status-item">
          <div className="status-left">
            <div className="status-label">Plastic Bin</div>
            <div className="status-sublabel">
              Next emptying due in 2-3 cycles
            </div>
          </div>
          <div className="status-value full">Full</div>
        </div>
      
      
        {/* Metal Bin */}
      <div className="status-item">
        <div className="status-left">
          <div className="status-label">Metal Bin</div>
          <div className="status-sublabel">
            Last emptied: 12:45 PM, Capacity: 5.0 L
          </div>
        </div>
        <div className="status-value">Not Full</div>
      </div>
    
      {/* Valuables Bin */}
      <div className="status-item">
        <div className="status-left">
          <div className="status-label">Valuables Bin</div>
          <div className="status-sublabel">
            Last emptied: 12:45 PM, Capacity: 2.0 L
          </div>
        </div>
        <div className="status-value full">Full</div>
      </div>
    </div>

      {/*LOGOUT BUTTON*/}
      <div className="logout-container">
        <button onClick={handleLogout} className="logout-button">
          Logout
        </button>
      </div>


      {/*BOTTOM NAVIGATION*/}
      <div className="bottom-nav">

        <div className="nav-item active">
          <div className="nav-icon">
            <Home size={22} />
          </div>
          <div className="nav-label">Home</div>
        </div>

        <div className="nav-item" onClick={() => navigate('/reports')}>
          <div className="nav-icon">
            <BarChart2 size={22} />
          </div>
          <div className="nav-label">Reports</div>
        </div>

        <div className="nav-item" onClick={() => navigate('/robot-control')}>
          <div className="nav-icon">
            <Gamepad2 size={22} />
          </div>
          <div className="nav-label">Robot Control</div>
        </div>

        <div className="nav-item" onClick={() => navigate('/valuables')}>
          <div className="nav-icon">
            <Search size={22} />
          </div>
          <div className="nav-label">Valuables</div>
        </div>

      </div>

    </div>
  );
}

export default DashboardScreen;