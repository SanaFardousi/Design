import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Valuablesscreen.css';

// Import SVG icons from lucide-react for consistent UI across pages
import {
  Settings,
  Search,
  Gem,
  Home,
  BarChart2,
  Gamepad2,
  MapPin,
  Calendar,
  X
} from 'lucide-react';

function ValuablesScreen() {
  const navigate = useNavigate();
  
  // State for real data from backend
  const [valuables, setValuables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);

  // Fetch valuables from backend when component loads
  useEffect(() => {
    fetchValuables();
  }, []);

  const fetchValuables = async () => {
    try {
      setLoading(true);
      setError('');
      
      const response = await fetch('http://localhost:5000/api/reports/valuables');
      const data = await response.json();

      if (data.success) {
        console.log('Fetched valuables:', data.valuables);
        setValuables(data.valuables);
      } else {
        setError('Failed to load valuable items');
      }
    } catch (err) {
      console.error('Error fetching valuables:', err);
      setError('Cannot connect to server. Make sure backend is running!');
    } finally {
      setLoading(false);
    }
  };

  // Format timestamp to readable date
  const formatDate = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    });
  };

  // Filter items based on search input
  const filtered = valuables.filter(item =>
    (item.beach_cleaned && item.beach_cleaned.toLowerCase().includes(search.toLowerCase())) ||
    formatDate(item.timestamp).toLowerCase().includes(search.toLowerCase())
  );

  // Open item details modal
  const openDetails = (item) => {
    setSelectedItem(item);
  };

  // Close modal
  const closeDetails = () => {
    setSelectedItem(null);
  };

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
          placeholder="Search by location or date"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="val-section">
        <div className="val-section-title">Valuable Items</div>

        {/* Loading state */}
        {loading && (
          <div className="val-loading">
            ⏳ Loading valuable items...
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="val-error">
             {error}
            <button onClick={fetchValuables} className="retry-btn">
               Retry
            </button>
          </div>
        )}

        {/* Items grid */}
        {!loading && !error && (
          <div className="val-grid">
            {filtered.map(item => (
              <div 
                className="val-card" 
                key={item.item_id}
                onClick={() => openDetails(item)}
              >
                {/* Image area */}
                <div className="val-img">
                  {item.image_url ? (
                    <img 
                      src={item.image_url}
                      alt={`Valuable item ${item.item_id}`}
                      className="val-real-img"
                      onError={(e) => {
                        // Fallback if image fails to load
                        e.target.style.display = 'none';
                        e.target.parentElement.innerHTML = `
                          <span class="val-img-icon">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                              <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path>
                              <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path>
                              <path d="M4 22h16"></path>
                              <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path>
                              <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path>
                              <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"></path>
                            </svg>
                          </span>
                        `;
                      }}
                    />
                  ) : (
                    <span className="val-img-icon">
                      <Gem size={20} />
                    </span>
                  )}
                </div>

                {/* Item info */}
                <div className="val-card-date">
                  Found {formatDate(item.timestamp)}
                </div>
                <div className="val-card-loc">
                  {item.beach_cleaned || 'Unknown Location'}
                </div>
              </div>
            ))}

            {/* Empty state */}
            {filtered.length === 0 && (
              <div className="val-empty">
                {search ? 'No items match your search' : 'No valuable items found yet'}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Item Details Modal */}
      {selectedItem && (
        <div className="val-modal-overlay" onClick={closeDetails}>
          <div className="val-modal" onClick={(e) => e.stopPropagation()}>
            
            {/* Close button */}
            <button className="val-modal-close" onClick={closeDetails}>
              <X size={24} />
            </button>

            {/* Modal title */}
            <h3 className="val-modal-title">Item Details</h3>

            {/* Large image */}
            <div className="val-modal-img-container">
              {selectedItem.image_url ? (
                <img 
                  src={selectedItem.image_url}
                  alt="Valuable item"
                  className="val-modal-img"
                />
              ) : (
                <div className="val-modal-no-img">
                  <Gem size={60} />
                  <p>No image available</p>
                </div>
              )}
            </div>

            {/* Details */}
            <div className="val-modal-details">
              
              <div className="val-modal-row">
                <span className="val-modal-label">
                  <Calendar size={16} /> Found Date:
                </span>
                <span className="val-modal-value">
                  {formatDate(selectedItem.timestamp)}
                </span>
              </div>

              <div className="val-modal-row">
                <span className="val-modal-label">
                  <MapPin size={16} /> Location:
                </span>
                <span className="val-modal-value">
                  {selectedItem.beach_cleaned || 'Unknown Beach'}
                </span>
              </div>

              {selectedItem.location_lat && selectedItem.location_lng && (
                <div className="val-modal-row">
                  <span className="val-modal-label">
                     GPS:
                  </span>
                  <span className="val-modal-value gps">
                    {selectedItem.location_lat.toFixed(6)}, {selectedItem.location_lng.toFixed(6)}
                  </span>
                </div>
              )}

              <div className="val-modal-row">
                <span className="val-modal-label">
                   Item ID:
                </span>
                <span className="val-modal-value">
                  #{selectedItem.item_id}
                </span>
              </div>

              <div className="val-modal-row">
                <span className="val-modal-label">
                   Status:
                </span>
                <span className="val-modal-value">
                  <span className="status-badge">{selectedItem.status}</span>
                </span>
              </div>

            </div>

            {/* Action button */}
            <button className="val-modal-btn">
               Mark as Returned
            </button>

          </div>
        </div>
      )}

      {/* Bottom Navigation */}
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