import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Valuablesscreen.css';

import {
  Settings,
  Search,
  Home,
  BarChart2,
  Gamepad2,
  X,
  MapPin,
  PackageSearch
} from 'lucide-react';

function ValuablesScreen() {
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);
  const [selectedStatus, setSelectedStatus] = useState('');
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    const fetchValuables = async () => {
      try {
        const res = await fetch('http://localhost:5000/api/items/valuables');
        const data = await res.json();

        if (data.success) {
          setItems(data.items);
        } else {
          setError('Could not load valuable items.');
        }
      } catch (err) {
        console.error('Fetch error:', err);
        setError('Could not connect to the server.');
      } finally {
        setLoading(false);
      }
    };

    fetchValuables();
  }, []);

  const formatCategory = (category) => {
    if (!category) return 'Unknown';

    const map = {
      watches: 'Watch',
      wallets: 'Wallet',
      sunglasses: 'Sunglasses'
    };

    return map[category.toLowerCase()] || category;
  };

  const formatStatus = (status) => {
    if (!status) return 'Unknown';
    return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
  };

  const getStatusClass = (status) => {
    if (!status) return 'status-unknown';

    const normalized = status.toLowerCase();

    if (normalized === 'stored') return 'status-stored';
    if (normalized === 'claimed') return 'status-claimed';
    if (normalized === 'pending') return 'status-pending';

    return 'status-unknown';
  };

  const handleOpenItem = (item) => {
    setSelectedItem(item);
    setSelectedStatus(item.status || 'pending');
  };

  const handleCloseModal = () => {
    setSelectedItem(null);
    setSelectedStatus('');
  };

  const handleUpdateStatus = async () => {
    if (!selectedItem) return;

    try {
      setUpdating(true);

      const res = await fetch(
        `http://localhost:5000/api/items/${selectedItem.item_id}/status`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ status: selectedStatus })
        }
      );

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to update status');
      }

      const updatedItems = items.map((item) =>
        item.item_id === selectedItem.item_id
          ? { ...item, status: selectedStatus }
          : item
      );

      setItems(updatedItems);

      setSelectedItem({
        ...selectedItem,
        status: selectedStatus
      });

      alert('Status updated successfully');
    } catch (error) {
      console.error('Update status error:', error);
      alert(error.message || 'Failed to update status');
    } finally {
      setUpdating(false);
    }
  };

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
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px',
            marginBottom: '16px',
            flexWrap: 'wrap'
          }}
        >
          <div className="val-section-title">Valuable Items</div>

          <button
            onClick={() => navigate('/visitor-responses')}
            style={{
              padding: '10px 16px',
              borderRadius: '10px',
              border: 'none',
              backgroundColor: '#0f172a',
              color: '#ffffff',
              cursor: 'pointer',
              fontWeight: '600'
            }}
          >
            View Visitor Reports
          </button>
        </div>

        {loading && (
          <div className="val-state-card">
            <div className="val-loading-spinner"></div>
            <h3>Loading valuable items...</h3>
            <p>Please wait while the system retrieves recovered valuables.</p>
          </div>
        )}

        {!loading && error && (
          <div className="val-state-card error">
            <div className="val-empty-icon">!</div>
            <h3>Could not load items</h3>
            <p>{error}</p>
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="val-state-card empty">
            <div className="val-empty-icon">
              <PackageSearch size={24} />
            </div>
            <h3>No valuables found</h3>
            <p>Try changing the search text or check again later.</p>
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className="val-grid">
            {filtered.map((item) => (
              <div
                className="val-card"
                key={item.item_id}
                onClick={() => handleOpenItem(item)}
              >
                <img
                  className="val-img"
                  src={item.image_url}
                  alt={item.category}
                  onError={(e) => {
                    e.target.src = '/valuables/placeholder.jpg';
                  }}
                />

                <div className="val-card-content">
                  <div className="val-card-top">
                    <div className="val-card-category">
                      {formatCategory(item.category)}
                    </div>

                    <div className={`status-badge ${getStatusClass(item.status)}`}>
                      {formatStatus(item.status)}
                    </div>
                  </div>

                  <div className="val-card-date">
                    Found: {new Date(item.timestamp).toLocaleString()}
                  </div>

                  <div className="val-card-loc">
                    Beach: {item.beach_cleaned || 'Unknown beach'}
                  </div>

                  <div className="val-card-gps">
                    GPS: {item.location_lat ?? 'N/A'}, {item.location_lng ?? 'N/A'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedItem && (
        <div className="val-modal-overlay" onClick={handleCloseModal}>
          <div className="val-modal" onClick={(e) => e.stopPropagation()}>
            <button
              className="val-modal-close"
              onClick={handleCloseModal}
            >
              <X size={18} />
            </button>

            <img
              className="val-modal-img"
              src={selectedItem.image_url}
              alt={selectedItem.category}
              onError={(e) => {
                e.target.src = '/valuables/placeholder.jpg';
              }}
            />

            <div className="val-modal-body">
              <h2>{formatCategory(selectedItem.category)}</h2>

              <div className="val-modal-status-row">
                <div className={`status-badge ${getStatusClass(selectedItem.status)}`}>
                  {formatStatus(selectedItem.status)}
                </div>
              </div>

              <div className="val-modal-meta">
                <p>
                  <span className="val-modal-label">Beach:</span>{' '}
                  <span className="val-modal-value">
                    {selectedItem.beach_cleaned || 'Unknown beach'}
                  </span>
                </p>

                <p>
                  <span className="val-modal-label">Found at:</span>{' '}
                  <span className="val-modal-value">
                    {selectedItem.timestamp
                      ? new Date(selectedItem.timestamp).toLocaleString()
                      : 'N/A'}
                  </span>
                </p>

                <p>
                  <span className="val-modal-label">GPS:</span>{' '}
                  <span className="val-modal-value">
                    {selectedItem.location_lat ?? 'N/A'}, {selectedItem.location_lng ?? 'N/A'}
                  </span>
                </p>

                <p>
                  <span className="val-modal-label">Session ID:</span>{' '}
                  <span className="val-modal-value">
                    {selectedItem.session_id ?? 'N/A'}
                  </span>
                </p>
              </div>

              {selectedItem.location_lat != null && selectedItem.location_lng != null && (
                <a
                  className="val-map-link"
                  href={`https://www.google.com/maps?q=${selectedItem.location_lat},${selectedItem.location_lng}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MapPin size={16} />
                  View location on map
                </a>
              )}

              <div className="val-modal-status-edit">
                <label className="val-modal-label">Update Status</label>

                <select
                  className="val-status-select"
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                >
                  <option value="pending">Pending</option>
                  <option value="stored">Stored</option>
                  <option value="claimed">Claimed</option>
                </select>

                <button
                  className="val-modal-btn val-modal-btn-primary"
                  onClick={handleUpdateStatus}
                  disabled={updating}
                >
                  {updating ? 'Updating...' : 'Update Status'}
                </button>
              </div>

              <div className="val-modal-footer">
                <button
                  className="val-modal-btn"
                  onClick={handleCloseModal}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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