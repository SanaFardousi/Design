import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './DashboardScreen.css';

import {
  Settings,
  Play,
  AlertTriangle,
  Home,
  BarChart2,
  Gamepad2,
  Search,
  Bell,
  MapPin,
  PauseCircle,
  Activity,
  Clock3,
  Square,
} from 'lucide-react';

function DashboardScreen() {
  const navigate = useNavigate();

  const [userEmail, setUserEmail] = useState('');
  const [bins, setBins] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [currentSession, setCurrentSession] = useState(null);
  const [robotStatus, setRobotStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const isLoggedIn = localStorage.getItem('isLoggedIn');
    const email = localStorage.getItem('userEmail');

    if (!isLoggedIn) {
      navigate('/');
      return;
    }

    setUserEmail(email || '');

    const fetchBins = async () => {
      try {
        const res = await fetch('http://localhost:5000/api/bins');
        const data = await res.json();
        setBins(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('Failed to fetch bins:', err);
      }
    };

    const fetchCurrentSession = async () => {
      try {
        const res = await fetch('http://localhost:5000/api/robot/current-session');
        const data = await res.json();

        if (data.success) {
          setCurrentSession(data.session || null);
          return data.session || null;
        }

        setCurrentSession(null);
        return null;
      } catch (err) {
        console.error('Failed to fetch current session:', err);
        setCurrentSession(null);
        return null;
      }
    };

    const fetchNotifications = async (hasActiveSession) => {
      try {
        if (!hasActiveSession) {
          setNotifications([]);
          return;
        }

        const res = await fetch('http://localhost:5000/api/notifications');
        const data = await res.json();

        if (data.success) {
          setNotifications(data.notifications || []);
        } else {
          setNotifications([]);
        }
      } catch (err) {
        console.error('Failed to fetch notifications:', err);
        setNotifications([]);
      }
    };

    const fetchRobotStatus = async () => {
      try {
        const res = await fetch('http://localhost:5000/api/robot/status');
        const data = await res.json();

        if (data.success) {
          setRobotStatus(data.robot || null);
        } else {
          setRobotStatus(null);
        }
      } catch (err) {
        console.error('Failed to fetch robot status:', err);
        setRobotStatus(null);
      }
    };

    const fetchAll = async () => {
      try {
        const session = await fetchCurrentSession();

        await Promise.all([
          fetchBins(),
          fetchRobotStatus(),
          fetchNotifications(!!session),
        ]);
      } finally {
        setLoading(false);
      }
    };

    fetchAll();

    const interval = setInterval(fetchAll, 5000);
    return () => clearInterval(interval);
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('userEmail');
    navigate('/');
  };

  const normalizeNotificationType = (type) => {
    if (!type) return '';

    return String(type)
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_');
  };

  const getNotificationTitle = (type) => {
    const normalized = normalizeNotificationType(type);

    const titleMap = {
      obstacle_detected: 'Obstacle Detected',
      obstacle_cleared: 'Obstacle Cleared',
      valuable_item_found: 'Valuable Item Found',
    };

    return titleMap[normalized] || String(type).replace(/_/g, ' ');
  };

  const getNotificationIcon = (type) => {
    const normalized = normalizeNotificationType(type);

    const iconMap = {
      obstacle_detected: <AlertTriangle size={18} />,
      obstacle_cleared: <Play size={18} />,
      valuable_item_found: <Search size={18} />,
    };

    return iconMap[normalized] || <Bell size={18} />;
  };

  const getSessionStatusLabel = (status) => {
    if (!status) return 'No Active Session';

    const normalized = String(status).toLowerCase();

    if (normalized === 'in_progress') return 'Running';
    if (normalized === 'paused') return 'Paused';
    if (normalized === 'completed') return 'Completed';

    return status.replace(/_/g, ' ');
  };

  const getSessionStatusIcon = (status) => {
    if (!status) return <Activity size={18} />;

    const normalized = String(status).toLowerCase();

    if (normalized === 'in_progress') return <Play size={18} />;
    if (normalized === 'paused') return <PauseCircle size={18} />;
    if (normalized === 'completed') return <Square size={18} />;

    return <Activity size={18} />;
  };

  const getRobotStatusLabel = (status) => {
    if (!status) return 'Unknown';

    const normalized = String(status).toLowerCase();

    if (normalized === 'cleaning') return 'Cleaning';
    if (normalized === 'paused') return 'Paused';
    if (normalized === 'idle') return 'Idle';

    return status;
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

      {/* Current Robot Activity */}
      <div className="section">
        <h2 className="section-title">Current Robot Activity</h2>

        {loading ? (
          <div className="activity-card-empty">Loading current session...</div>
        ) : !currentSession ? (
          <div className="activity-card-empty">
            No active cleaning session
          </div>
        ) : (
          <div className="robot-activity-card">
            <div className="robot-activity-row">
              <div className="robot-activity-icon">
                <MapPin size={18} />
              </div>
              <div className="robot-activity-content">
                <div className="robot-activity-label">Active Beach</div>
                <div className="robot-activity-value">
                  {currentSession.beach_cleaned || 'Unknown Beach'}
                </div>
              </div>
            </div>

            <div className="robot-activity-row">
              <div className="robot-activity-icon">
                {getSessionStatusIcon(currentSession.status)}
              </div>
              <div className="robot-activity-content">
                <div className="robot-activity-label">Session Status</div>
                <div className="robot-activity-value">
                  {getSessionStatusLabel(currentSession.status)}
                </div>
              </div>
            </div>

            <div className="robot-activity-row">
              <div className="robot-activity-icon">
                <Clock3 size={18} />
              </div>
              <div className="robot-activity-content">
                <div className="robot-activity-label">Started At</div>
                <div className="robot-activity-value">
                  {currentSession.start_time
                    ? new Date(currentSession.start_time).toLocaleString()
                    : 'N/A'}
                </div>
              </div>
            </div>

            <div className="robot-activity-row">
              <div className="robot-activity-icon">
                <Activity size={18} />
              </div>
              <div className="robot-activity-content">
                <div className="robot-activity-label">Session ID</div>
                <div className="robot-activity-value">
                  #{currentSession.session_id}
                </div>
              </div>
            </div>

            <div className="robot-activity-row">
              <div className="robot-activity-icon">
                <Bell size={18} />
              </div>
              <div className="robot-activity-content">
                <div className="robot-activity-label">Robot Status</div>
                <div className="robot-activity-value">
                  {getRobotStatusLabel(robotStatus?.status)}
                </div>
              </div>
            </div>

            <div className="robot-activity-row">
              <div className="robot-activity-icon">
                <MapPin size={18} />
              </div>
              <div className="robot-activity-content">
                <div className="robot-activity-label">Current GPS</div>
                <div className="robot-activity-value">
                  Not connected yet
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Operational Alerts */}
      <div className="section">
        <h2 className="section-title">Operational Alerts</h2>

        {loading ? (
          <div className="alert-text">Loading alerts...</div>
        ) : !currentSession ? (
          <div className="alert-text">No alerts available</div>
        ) : notifications.length === 0 ? (
          <div className="alert-text">No alerts available</div>
        ) : (
          notifications.slice(0, 5).map((notification) => (
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

      {/* Current Status Overview */}
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
                Last updated: {bin.updated_at
                  ? new Date(bin.updated_at).toLocaleTimeString()
                  : 'N/A'}
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