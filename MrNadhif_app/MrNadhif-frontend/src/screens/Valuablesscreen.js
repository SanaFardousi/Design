import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Valuablesscreen.css';

const MOCK_ITEMS = [
  { id: 1, date: 'Found Nov 20', location: 'Egaila', color: '#c8b89a' },
  { id: 2, date: 'Found Nov 10', location: 'Shuwaikh', color: '#d4c5a9' },
  { id: 3, date: 'Found Nov 20', location: 'Shuwaikh', color: '#b8a882' },
  { id: 4, date: 'Found Dec 01', location: 'Fintas', color: '#cfc0a0' },
  { id: 5, date: 'Found Dec 03', location: 'Egaila', color: '#bfae92' },
  { id: 6, date: 'Found Dec 05', location: 'Shuwaikh', color: '#d0bc98' },
];

function ValuablesScreen() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const filtered = MOCK_ITEMS.filter(item =>
    item.location.toLowerCase().includes(search.toLowerCase()) ||
    item.date.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="val-container">
      {/* Header */}
      <div className="val-header">
        <div className="val-header-title">Valuables</div>
        <button className="val-settings-btn">⚙️</button>
      </div>

      {/* Search */}
      <div className="val-search-wrapper">
        <span className="val-search-icon">🔍</span>
        <input
          className="val-search"
          placeholder="Search"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Grid */}
      <div className="val-section">
        <div className="val-section-title">Valuable Items</div>
        <div className="val-grid">
          {filtered.map(item => (
            <div className="val-card" key={item.id}>
              <div
                className="val-img"
                style={{ background: `linear-gradient(135deg, ${item.color}, #a0916e)` }}
              >
                <span className="val-img-icon">💎</span>
              </div>
              <div className="val-card-date">{item.date},</div>
              <div className="val-card-loc">{item.location}</div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="val-empty">No items found</div>
          )}
        </div>
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
        <div className="nav-item active">
          <div className="nav-icon">🔍</div>
          <div className="nav-label">Lost & Found</div>
        </div>
      </div>
    </div>
  );
}

export default ValuablesScreen;