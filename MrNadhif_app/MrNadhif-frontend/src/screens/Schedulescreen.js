import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Schedulescreen .css';

import {
  CheckCircle2,
  ChevronDown,
  Home,
  BarChart2,
  Gamepad2,
  Search,
} from 'lucide-react';

function ScheduleScreen() {
  const navigate = useNavigate();
// remove the hardcoded days and dates
  const [beach, setBeach] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const beaches = [
    'Salmyia Beach',
    'Fintas Beach',
    'Egaila Beach',
  ];

  const handleSave = async () => {
    if (!beach || !date || !startTime) {
      alert('Please fill in all fields.');
      return;
    }

    try {
      setSaving(true);

      const res = await fetch('http://localhost:5000/api/robot/schedule', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          beach_name: beach,
          date,
          start_time: startTime,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to save schedule');
      }

      setSaved(true);

      setTimeout(() => {
        setSaved(false);
        navigate('/robot-control');
      }, 1200);

    } catch (error) {
      console.error('Error saving schedule:', error);
      alert(error.message || 'Server error while saving schedule');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="sched-container">
      <div className="sched-header">
        <div className="sched-header-title">Schedule Cleaning</div>
      </div>

      <div className="sched-section">
        <div className="sched-section-title">Select Target Beach</div>
        <div className="sched-select-wrapper">
          <select
            className="sched-select"
            value={beach}
            onChange={(e) => setBeach(e.target.value)}
          >
            <option value="">Choose Beach</option>
            {beaches.map((b, i) => (
              <option key={i} value={b}>{b}</option>
            ))}
          </select>

          <span className="sched-select-arrow" aria-hidden="true">
            <ChevronDown size={16} />
          </span>
        </div>
      </div>

      <div className="sched-section">
        <div className="sched-section-title">Schedule Time</div>

        <input
          type="date"
          className="sched-input"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />

        <div className="sched-time-row">
          <div className="sched-time-wrapper">
            <input
              type="time"
              className="sched-input sched-time-input"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="sched-save-wrapper">
        <button
          className={`sched-save-btn ${saved ? 'sched-saved' : ''}`}
          onClick={handleSave}
          disabled={saving}
        >
          {saved ? (
            <span className="sched-saved-content">
              <CheckCircle2 size={18} />
              <span>Saved!</span>
            </span>
          ) : saving ? (
            'Saving...'
          ) : (
            'Save'
          )}
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

        <div className="nav-item active" onClick={() => navigate('/robot-control')}>
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

export default ScheduleScreen;