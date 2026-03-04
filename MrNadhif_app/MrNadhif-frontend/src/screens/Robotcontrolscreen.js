import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Robotcontrolscreen.css';

// Import Lucide SVG icons to replace emojis/symbols
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
  AlertTriangle,
} from 'lucide-react';

function RobotControlScreen() {
  const navigate = useNavigate();

  // robotStatus can be: "idle", "running", or "paused"
  const [robotStatus, setRobotStatus] = useState('idle');

  // Control handlers update the robotStatus state
  const handleStart = () => setRobotStatus('running');
  const handlePause = () => setRobotStatus('paused');
  const handleStop = () => setRobotStatus('idle');

  return (
    <div className="rc-container">
      {/* Header */}
      <div className="rc-header">
        <div className="rc-header-title">Robot Control</div>

        {/* Settings icon */}
        <button className="rc-settings-btn" aria-label="Settings" onClick={() => navigate('/settings')}>
          <Settings size={20} />
        </button>
      </div>

      {/* Map Area */}
      <div className="rc-map">
        <div className="rc-map-placeholder">
          {/*Map pin icon  */}
          <div className="rc-map-pin" aria-hidden="true">
            <MapPin size={22} />
          </div>

          <div className="rc-map-label">Fintas Beach — Kuwait</div>

          {/* Show the robot dot only while running */}
          {robotStatus === 'running' && (
            <div className="rc-robot-dot" aria-hidden="true">
              <div className="rc-robot-pulse"></div>


            </div>
          )}
        </div>
      </div>

      {/* Status Badge */}
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

      {/* Control Buttons */}
      <div className="rc-controls-card">
        <button
          className={`rc-btn rc-btn-start ${robotStatus === 'running' ? 'rc-btn-active' : ''}`}
          onClick={handleStart}
          disabled={robotStatus === 'running'}
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
          {/* Pause icon */}
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
          {/* Stop icon */}
          <span className="rc-btn-icon" aria-hidden="true">
            <Square size={18} />
          </span>
          <span className="rc-btn-label">Emergency Stop</span>
        </button>
      </div>

      {/* Schedule Button */}
      <div className="rc-schedule-wrapper">
        <button className="rc-schedule-btn" onClick={() => navigate('/schedule')}>
          {/* Calendar icon */}
          <Calendar size={18} /> <span>Schedule</span>
        </button>
      </div>

      {/* Bottom Navigation */}
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