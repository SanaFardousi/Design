import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './DashboardScreen.css';

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
  Bell
} from 'lucide-react';

function DashboardScreen() {
  const navigate = useNavigate();

  const [userEmail, setUserEmail] = useState('');
  const [bins, setBins] = useState([]);
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    const isLoggedIn = localStorage.getItem('isLoggedIn');
    const email = localStorage.getItem('userEmail');

    if (!isLoggedIn) {
      navigate('/');
    } else {
      setUserEmail(email || '');
    }

    const fetchBins = async () => {
      try {
        const res = await fetch('http://localhost:5000/api/bins');
        const data = await res.json();
        setBins(data);
      } catch (err) {
        console.error('Failed to fetch bins:', err);
      }
    };

    const fetchNotifications = async () => {
      try {
        const res = await fetch('http://localhost:5000/api/notifications');
        const data = await res.json();

        if (data.success) {
          setNotifications(data.notifications);
        }
      } catch (err) {
        console.error('Failed to fetch notifications:', err);
      }
    };

    fetchBins();
    fetchNotifications();
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('userEmail');
    navigate('/');
  };

  const getNotificationTitle = (type) => {
    if (!type) return 'Notification';

    const normalized = type.toLowerCase();

    if (normalized === 'alert') return 'Alert';
    if (normalized === 'warning') return 'Warning';
    if (normalized === 'obstacle_detected') return 'Obstacle Detected';
    if (normalized === 'operation_started') return 'Operation Started';
    if (normalized === 'paused') return 'Cleaning Paused';

    return type.replace(/_/g, ' ');
  };

  const getNotificationIcon = (type) => {
    if (!type) return <Bell size={18} />;

    const normalized = type.toLowerCase();

    if (normalized === 'alert') return <AlertTriangle size={18} />;
    if (normalized === 'warning') return <BatteryLow size={18} />;
    if (normalized === 'obstacle_detected') return <AlertTriangle size={18} />;
    if (normalized === 'operation_started') return <Play size={18} />;
    if (normalized === 'paused') return <Pause size={18} />;

    return <Bell size={18} />;
  };

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <div className="header-title">Mr.Nadhif Dashboard</div>

        <button className="settings-button" onClick={() => navigate('/settings')}>
          <Settings size={20} />
        </button>
      </div>

      <div className="welcome-banner">
        Welcome, {userEmail}!
      </div>

      <div className="section">
        <h2 className="section-title">Operational Alerts</h2>

        {notifications.length === 0 ? (
          <div className="alert-text">No alerts available</div>
        ) : (
          notifications.slice(0, 3).map((notification) => (
            <div className="alert-item" key={notification.notification_id}>
              <div className="alert-icon blue">
                {getNotificationIcon(notification.type)}
              </div>
              <div className="alert-content">
                <div className="alert-heading">
                  {getNotificationTitle(notification.type)}
                </div>
                <div className="alert-text">{notification.message}</div>
                <div className="alert-time">
                  {new Date(notification.timestamp).toLocaleString()}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="section">
        <h2 className="section-title">Robot Activity Log</h2>

        <div className="activity-timeline">
          {notifications.length === 0 ? (
            <div className="activity-content">
              <div className="activity-heading">No activity found</div>
            </div>
          ) : (
            notifications.map((notification, index) => (
              <div className="activity-item" key={notification.notification_id}>
                <div className="activity-icon">
                  {getNotificationIcon(notification.type)}
                </div>

                {index !== notifications.length - 1 && (
                  <div className="activity-line"></div>
                )}

                <div className="activity-content">
                  <div className="activity-heading">
                    {getNotificationTitle(notification.type)}
                  </div>
                  <div className="alert-text">{notification.message}</div>
                  <div className="activity-time">
                    {new Date(notification.timestamp).toLocaleString()}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="section">
        <h2 className="section-title">Current Status Overview</h2>

        <div className="status-item">
          <div className="status-left">
            <div className="status-label">Battery Level</div>
            <div className="status-sublabel">
              Estimated 3 hours remaining
            </div>
          </div>
          <div className="status-value">70%</div>
        </div>

        {bins.map((bin) => (
          <div className="status-item" key={bin.bin_id}>
            <div className="status-left">
              <div className="status-label">{bin.label} Bin</div>
              <div className="status-sublabel">
                Last updated: {new Date(bin.updated_at).toLocaleTimeString()}
              </div>
            </div>
            <div className={`status-value ${bin.is_full ? 'full' : ''}`}>
              {bin.is_full ? 'Full' : 'Not Full'}
            </div>
          </div>
        ))}
      </div>

      <div className="logout-container">
        <button onClick={handleLogout} className="logout-button">
          Logout
        </button>
      </div>

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