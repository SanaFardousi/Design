import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Valuablesscreen.css';

import {
  Settings,
  Search,
  Home,
  BarChart2,
  Gamepad2
} from 'lucide-react';

function ValuablesScreen() {
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchValuables = async () => {
      try {
        const res = await fetch('http://localhost:5000/api/items/valuables');
        const data = await res.json();

        if (data.success) {
          setItems(data.items);
        } else {
          setError('Failed to load valuables');
        }
      } catch (err) {
        console.error('Fetch error:', err);
        setError('Could not connect to server');
      } finally {
        setLoading(false);
      }
    };

    fetchValuables();
  }, []);

  const filtered = items.filter((item) => {
    const searchText = search.toLowerCase();

    const beach = (item.beach_cleaned || '').toLowerCase();
    const category = (item.category || '').toLowerCase();
    const status = (item.status || '').toLowerCase();
    const date = item.timestamp
      ? new Date(item.timestamp).toLocaleString().toLowerCase()
      : '';
    const gps = `${item.location_lat || ''} ${item.location_lng || ''}`.toLowerCase();

    return (
      beach.includes(searchText) ||
      category.includes(searchText) ||
      status.includes(searchText) ||
      date.includes(searchText) ||
      gps.includes(searchText)
    );
  });

  return (
    <div className="val-container">
      <div className="val-header">
        <div className="val-header-title">Valuables</div>

        <button className="val-settings-btn">
          <Settings size={20} />
        </button>
      </div>

      <div className="val-search-wrapper">
        <span className="val-search-icon">
          <Search size={18} />
        </span>

        <input
          className="val-search"
          placeholder="Search by beach, category, date, or status"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="val-section">
        <div className="val-section-title">Valuable Items</div>

        {loading && <div className="val-empty">Loading...</div>}
        {error && <div className="val-empty">{error}</div>}

        {!loading && !error && (
          <div className="val-grid">
            {filtered.map((item) => (
              <div className="val-card" key={item.item_id}>
                <img
                  className="val-img"
                  src={item.image_url}
                  alt={item.category}
                />

                <div className="val-card-date">
                  Found: {new Date(item.timestamp).toLocaleString()}
                </div>

                <div className="val-card-loc">
                  Beach: {item.beach_cleaned || 'Unknown beach'}
                </div>

                <div className="val-card-loc">
                  Category: {item.category}
                </div>

                <div className="val-card-loc">
                  Status: {item.status}
                </div>

                <div className="val-card-loc">
                  GPS: {item.location_lat ?? 'N/A'}, {item.location_lng ?? 'N/A'}
                </div>
              </div>
            ))}

            {filtered.length === 0 && (
              <div className="val-empty">No items found</div>
            )}
          </div>
        )}
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