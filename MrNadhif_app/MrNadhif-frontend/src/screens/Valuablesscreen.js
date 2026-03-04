import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Valuablesscreen.css';

// Import SVG icons from lucide-react for consistent UI across pages
import {
  Settings,
  Search,
  Gem,
  Home,
  BarChart2,
  Gamepad2
} from 'lucide-react';


// Mock data representing valuable items found by the robot
const MOCK_ITEMS = [
  { id: 1, date: 'Found Nov 20', location: 'Egaila', color: '#c8b89a' },
  { id: 2, date: 'Found Nov 10', location: 'Shuwaikh', color: '#d4c5a9' },
  { id: 3, date: 'Found Nov 20', location: 'Shuwaikh', color: '#b8a882' },
  { id: 4, date: 'Found Dec 01', location: 'Fintas', color: '#cfc0a0' },
  { id: 5, date: 'Found Dec 03', location: 'Egaila', color: '#bfae92' },
  { id: 6, date: 'Found Dec 05', location: 'Shuwaikh', color: '#d0bc98' },
];

function ValuablesScreen() {

  // Used to navigate between pages
  const navigate = useNavigate();

  // Search input state
  const [search, setSearch] = useState('');

  /*
    Filter items based on search input.
    User can search by location OR date.
  */
  const filtered = MOCK_ITEMS.filter(item =>
    item.location.toLowerCase().includes(search.toLowerCase()) ||
    item.date.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="val-container">

      <div className="val-header">

        {/* Page Title */}
        <div className="val-header-title">Valuables</div>

        {/* Settings icon */}
        <button className="val-settings-btn">
          <Settings size={20} />
        </button>

      </div>


      <div className="val-search-wrapper">

        {/* Search icon*/}
        <span className="val-search-icon">
          <Search size={18} />
        </span>

        <input
          className="val-search"
          placeholder="Search"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>


      <div className="val-section">

        <div className="val-section-title">Valuable Items</div>

        <div className="val-grid">

          {/* Render cards for filtered items */}
          {filtered.map(item => (
            <div className="val-card" key={item.id}>

              {/* Image placeholder area */}
              <div
                className="val-img"
                style={{ background: `linear-gradient(135deg, ${item.color}, #a0916e)` }}
              >

                {/* Gem icon representing a valuable item */}
                <span className="val-img-icon">
                  <Gem size={20} />
                </span>

              </div>

              {/* Item metadata */}
              <div className="val-card-date">{item.date},</div>
              <div className="val-card-loc">{item.location}</div>

            </div>
          ))}

          {/* Message when no items match search */}
          {filtered.length === 0 && (
            <div className="val-empty">No items found</div>
          )}

        </div>
      </div>


      <div className="bottom-nav">

        <div className="nav-item" onClick={() => navigate('/dashboard')}>
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

        <div className="nav-item active">
          <div className="nav-icon">
            <Search size={22} />
          </div>
          <div className="nav-label">Lost & Found</div>
        </div>

      </div>
    </div>
  );
}

export default ValuablesScreen;