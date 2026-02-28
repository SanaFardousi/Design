import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Robotcontrolscreen.css';

function RobotControlScreen() {
  const navigate = useNavigate();
  const [robotStatus, setRobotStatus] = useState('idle'); // idle, running, paused

  const handleStart = () => setRobotStatus('running');
  const handlePause = () => setRobotStatus('paused');
  const handleStop = () => setRobotStatus('idle');

  return (
    <div className="rc-container">
      {/* Header */}
      <div className="rc-header">
        <div className="rc-header-title">Robot Control</div>
        <button className="rc-settings-btn">⚙️</button>
      </div>

      {/* Map Area */}
      <div className="rc-map">
        <div className="rc-map-placeholder">
          <div className="rc-map-pin">📍</div>
          <div className="rc-map-label">Fintas Beach — Kuwait</div>
          {robotStatus === 'running' && (
            <div className="rc-robot-dot">
              <div className="rc-robot-pulse"></div>
            </div>
          )}
        </div>
      </div>

      {/* Status Badge */}
      <div className={`rc-status-badge rc-status-${robotStatus}`}>
        {robotStatus === 'idle' && '⬛ Robot Idle'}
        {robotStatus === 'running' && '🟢 Robot Running'}
        {robotStatus === 'paused' && '🟡 Robot Paused'}
      </div>

      {/* Control Buttons */}
      <div className="rc-controls-card">
        <button
          className={`rc-btn rc-btn-start ${robotStatus === 'running' ? 'rc-btn-active' : ''}`}
          onClick={handleStart}
          disabled={robotStatus === 'running'}
        >
          <span className="rc-btn-icon">▶</span>
          <span className="rc-btn-label">Start</span>
        </button>

        <button
          className={`rc-btn rc-btn-pause ${robotStatus === 'paused' ? 'rc-btn-active' : ''}`}
          onClick={handlePause}
          disabled={robotStatus !== 'running'}
        >
          <span className="rc-btn-icon">⏸</span>
          <span className="rc-btn-label">Pause</span>
        </button>

        <button
          className="rc-btn rc-btn-stop"
          onClick={handleStop}
          disabled={robotStatus === 'idle'}
        >
          <span className="rc-btn-icon">⏹</span>
          <span className="rc-btn-label">Emergency Stop</span>
        </button>
      </div>

      {/* Schedule Button */}
      <div className="rc-schedule-wrapper">
        <button className="rc-schedule-btn" onClick={() => navigate('/schedule')}>
          📅 Schedule
        </button>
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
        <div className="nav-item active">
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

export default RobotControlScreen;