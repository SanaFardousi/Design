import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Schedulescreen .css'; // (keeping your original path as-is)

// Lucide SVG icons
import {
  Calendar,
  CheckCircle2,
  ChevronDown,
  Home,
  BarChart2,
  Gamepad2,
  Search,
} from 'lucide-react';

function ScheduleScreen() {
  const navigate = useNavigate();

  const [selectedDay, setSelectedDay] = useState(3); // Thu default
  const [beach, setBeach] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [saved, setSaved] = useState(false);

  const days = [
    { label: 'Mon', num: '02' },
    { label: 'Tue', num: '03' },
    { label: 'Wed', num: '04' },
    { label: 'Thu', num: '07' },
    { label: 'Fri', num: '05' },
    { label: 'Sat', num: '06' },
    { label: 'Sun', num: '08' },
  ];

  const beaches = ['Fintas Beach', 'Shuwaikh Beach', 'Egaila Beach', 'Abu Al Hasaniya Beach'];

  const handleSave = () => {
    if (!beach || !date || !startTime || !endTime) {
      alert('Please fill in all fields.');
      return;
    }
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      navigate('/robot-control');
    }, 1500);
  };

  return (
    <div className="sched-container">
      {/* Header */}
      <div className="sched-header">
        <div className="sched-header-title">Schedule Cleaning</div>
      </div>

      {/* Day Picker */}
      <div className="sched-day-row">
        {days.map((d, i) => (
          <div
            key={i}
            className={`sched-day ${selectedDay === i ? 'sched-day-active' : ''}`}
            onClick={() => setSelectedDay(i)}
          >
            <div className="sched-day-label">{d.label}</div>
            <div className="sched-day-num">{d.num}</div>
          </div>
        ))}
      </div>

      {/* Beach Select */}
      <div className="sched-section">
        <div className="sched-section-title">Select Target Beach</div>
        <div className="sched-select-wrapper">
          <select
            className="sched-select"
            value={beach}
            onChange={e => setBeach(e.target.value)}
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

      {/* Start Time */}
      <div className="sched-section">
        <div className="sched-section-title">Start Time</div>
        <input
          type="date"
          className="sched-input"
          value={date}
          onChange={e => setDate(e.target.value)}
        />
        <div className="sched-time-row">
          <div className="sched-time-wrapper">
            <input
              type="time"
              className="sched-input sched-time-input"
              placeholder="Start time"
              value={startTime}
              onChange={e => setStartTime(e.target.value)}
            />
          </div>
          <div className="sched-time-wrapper">
            <input
              type="time"
              className="sched-input sched-time-input"
              placeholder="End time"
              value={endTime}
              onChange={e => setEndTime(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="sched-save-wrapper">
        <button className={`sched-save-btn ${saved ? 'sched-saved' : ''}`} onClick={handleSave}>
          {saved ? (
            <span className="sched-saved-content">
              <CheckCircle2 size={18} />
              <span>Saved!</span>
            </span>
          ) : (
            'Save'
          )}
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
