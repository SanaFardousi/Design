import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Robotcontrolscreen.css';

import {
  Settings,
  MapPin,
  Circle,
  Play,
  Pause,
  Square,
  Calendar,
  Home,
  BarChart2,
  Gamepad2,
  Search,
  Clock3,
  Map,
} from 'lucide-react';

function RobotControlScreen() {
  const navigate = useNavigate();

  const [robotStatus, setRobotStatus] = useState('idle');
  const [latestSchedule, setLatestSchedule] = useState(null);
  const [currentSession, setCurrentSession] = useState(null);
  const [loading, setLoading] = useState(true);

  const parseGeofence = (geofenceJson) => {
    if (!geofenceJson) return null;

    try {
      return typeof geofenceJson === 'string'
        ? JSON.parse(geofenceJson)
        : geofenceJson;
    } catch (error) {
      console.error('Failed to parse geofence_json:', error);
      return null;
    }
  };

  const fetchRobotData = async () => {
    try {
      const [statusRes, scheduleRes, sessionRes] = await Promise.all([
        fetch('http://localhost:5000/api/robot/status'),
        fetch('http://localhost:5000/api/robot/latest-schedule'),
        fetch('http://localhost:5000/api/robot/current-session'),
      ]);

      const statusData = await statusRes.json();
      const scheduleData = await scheduleRes.json();
      const sessionData = await sessionRes.json();

      if (statusData.success && statusData.robot) {
        const backendStatus = statusData.robot.status || 'idle';
        setRobotStatus(backendStatus === 'cleaning' ? 'running' : backendStatus);
      }

      if (scheduleData.success) {
        setLatestSchedule(scheduleData.schedule || null);
      }

      if (sessionData.success) {
        setCurrentSession(sessionData.session || null);
      }
    } catch (error) {
      console.error('Error fetching robot control data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRobotData();
    const interval = setInterval(fetchRobotData, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleStart = async () => {
    try {
      const beachName =
        latestSchedule?.beach_name ||
        currentSession?.beach_cleaned;

      if (!beachName) {
        alert('Please create a schedule first.');
        return;
      }

      const res = await fetch('http://localhost:5000/api/robot/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ beach_name: beachName }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to start robot');
      }

      setRobotStatus('running');
      setCurrentSession(data.session || null);
      await fetchRobotData();
    } catch (error) {
      console.error('Error starting robot:', error);
      alert(error.message || 'Failed to start robot');
    }
  };

  const handlePause = async () => {
    try {
      const res = await fetch('http://localhost:5000/api/robot/pause', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to pause robot');
      }

      setRobotStatus('paused');
      await fetchRobotData();
    } catch (error) {
      console.error('Error pausing robot:', error);
      alert(error.message || 'Failed to pause robot');
    }
  };

  const handleStop = async () => {
    try {
      const res = await fetch('http://localhost:5000/api/robot/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to stop robot');
      }

      setRobotStatus('idle');
      setCurrentSession(null);
      await fetchRobotData();
    } catch (error) {
      console.error('Error stopping robot:', error);
      alert(error.message || 'Failed to stop robot');
    }
  };

  const parsedGeofence = parseGeofence(latestSchedule?.geofence_json);
  const scheduledEndTime = parsedGeofence?.end_time || null;

  const displayedBeach =
    currentSession?.beach_cleaned ||
    latestSchedule?.beach_name ||
    'No beach selected';

  return (
    <div className="rc-container">
      <div className="rc-header">
        <div className="rc-header-title">Robot Control</div>

        <button
          className="rc-settings-btn"
          aria-label="Settings"
          onClick={() => navigate('/settings')}
        >
          <Settings size={20} />
        </button>
      </div>

      <div className="rc-session-card">
        <div className="rc-session-title">
          {currentSession ? 'Current Cleaning Session' : 'Latest Scheduled Session'}
        </div>

        {loading ? (
          <div className="rc-session-empty">Loading...</div>
        ) : currentSession ? (
          <div className="rc-session-details">
            <div className="rc-session-row">
              <Map size={16} />
              <span><strong>Beach:</strong> {currentSession.beach_cleaned}</span>
            </div>

            <div className="rc-session-row">
              <Clock3 size={16} />
              <span>
                <strong>Started:</strong>{' '}
                {new Date(currentSession.start_time).toLocaleString()}
              </span>
            </div>

            <div className="rc-session-row">
              <Circle size={16} />
              <span><strong>Status:</strong> {currentSession.status}</span>
            </div>
          </div>
        ) : latestSchedule ? (
          <div className="rc-session-details">
            <div className="rc-session-row">
              <Map size={16} />
              <span><strong>Beach:</strong> {latestSchedule.beach_name || 'No beach selected'}</span>
            </div>

            <div className="rc-session-row">
              <Calendar size={16} />
              <span>
                <strong>Date:</strong>{' '}
                {new Date(latestSchedule.start_time).toLocaleDateString()}
              </span>
            </div>

            <div className="rc-session-row">
              <Clock3 size={16} />
              <span>
                <strong>Time:</strong> {latestSchedule.start_time_only}
                {scheduledEndTime ? ` - ${scheduledEndTime}` : ''}
              </span>
            </div>
          </div>
        ) : (
          <div className="rc-session-empty">No scheduled session yet.</div>
        )}
      </div>

      <div className="rc-map">
        <div className="rc-map-placeholder">
          <div className="rc-map-pin" aria-hidden="true">
            <MapPin size={22} />
          </div>

          <div className="rc-map-label">
            {displayedBeach !== 'No beach selected'
              ? `${displayedBeach} — Kuwait`
              : displayedBeach}
          </div>

          {robotStatus === 'running' && (
            <div className="rc-robot-dot" aria-hidden="true">
              <div className="rc-robot-pulse"></div>
            </div>
          )}
        </div>
      </div>

      <div className={`rc-status-badge rc-status-${robotStatus}`}>
        {robotStatus === 'idle' && (
          <>
            <Square size={16} /> <span>Robot Idle</span>
          </>
        )}

        {robotStatus === 'running' && (
          <>
            <Circle size={16} /> <span>Robot Running</span>
          </>
        )}

        {robotStatus === 'paused' && (
          <>
            <Pause size={16} /> <span>Robot Paused</span>
          </>
        )}
      </div>

      <div className="rc-controls-card">
        <button
          className={`rc-btn rc-btn-start ${robotStatus === 'running' ? 'rc-btn-active' : ''}`}
          onClick={handleStart}
          disabled={robotStatus === 'running' || !latestSchedule}
        >
          <span className="rc-btn-icon" aria-hidden="true">
            <Play size={18} />
          </span>
          <span className="rc-btn-label">Start</span>
        </button>

        <button
          className={`rc-btn rc-btn-pause ${robotStatus === 'paused' ? 'rc-btn-active' : ''}`}
          onClick={handlePause}
          disabled={robotStatus !== 'running'}
        >
          <span className="rc-btn-icon" aria-hidden="true">
            <Pause size={18} />
          </span>
          <span className="rc-btn-label">Pause</span>
        </button>

        <button
          className="rc-btn rc-btn-stop"
          onClick={handleStop}
          disabled={robotStatus === 'idle'}
        >
          <span className="rc-btn-icon" aria-hidden="true">
            <Square size={18} />
          </span>
          <span className="rc-btn-label">Emergency Stop</span>
        </button>
      </div>

      <div className="rc-schedule-wrapper">
        <button className="rc-schedule-btn" onClick={() => navigate('/schedule')}>
          <Calendar size={18} /> <span>Schedule</span>
        </button>
      </div>

      <div className="bottom-nav">
        <div className="nav-item" onClick={() => navigate('/dashboard')}>
          <div className="nav-icon" aria-hidden="true">
            <Home size={22} />
          </div>
          <div className="nav-label">Home</div>
        </div>

        <div className="nav-item" onClick={() => navigate('/reports')}>
          <div className="nav-icon" aria-hidden="true">
            <BarChart2 size={22} />
          </div>
          <div className="nav-label">Reports</div>
        </div>

        <div className="nav-item active">
          <div className="nav-icon" aria-hidden="true">
            <Gamepad2 size={22} />
          </div>
          <div className="nav-label">Robot Control</div>
        </div>

        <div className="nav-item" onClick={() => navigate('/valuables')}>
          <div className="nav-icon" aria-hidden="true">
            <Search size={22} />
          </div>
          <div className="nav-label">Lost & Found</div>
        </div>
      </div>
    </div>
  );
}

export default RobotControlScreen;