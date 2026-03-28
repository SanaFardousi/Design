import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';

import {
  Settings,
  Home,
  BarChart2,
  Gamepad2,
  Search
} from 'lucide-react';

import './ReportsScreen.css';

function ReportsScreen() {
  const navigate = useNavigate();

  const [selectedBeach, setSelectedBeach] = useState('All Beaches');

  const [summaryData, setSummaryData] = useState({
    valuables: 0,
    plastic: 0,
    metal: 0,
    total: 0
  });

  const [chartData, setChartData] = useState({
    valuables: [],
    plastic: [],
    metal: []
  });

  const [loading, setLoading] = useState(true);

  const beaches = [
    'All Beaches',
    'Kuwait City Beach',
    'Fintas Beach',
    'Egaila Beach'
  ];

  useEffect(() => {
    const isLoggedIn = localStorage.getItem('isLoggedIn');

    if (!isLoggedIn) {
      navigate('/');
      return;
    }

    const fetchReports = async () => {
      try {
        setLoading(true);

        const query =
          selectedBeach === 'All Beaches'
            ? ''
            : `?beach=${encodeURIComponent(selectedBeach)}`;

        const [summaryRes, trendsRes] = await Promise.all([
          fetch(`http://localhost:5000/api/reports/summary${query}`),
          fetch(`http://localhost:5000/api/reports/trends${query}`)
        ]);

        const summary = await summaryRes.json();
        const trends = await trendsRes.json();

        setSummaryData({
          valuables: summary.valuables || 0,
          plastic: summary.plastic || 0,
          metal: summary.metal || 0,
          total: summary.total || 0
        });

        setChartData({
          valuables: trends.valuables || [],
          plastic: trends.plastic || [],
          metal: trends.metal || []
        });
      } catch (err) {
        console.error('Failed to fetch reports:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchReports();
  }, [navigate, selectedBeach]);

  const handleDownloadReport = async () => {
    try {
      const query =
        selectedBeach === 'All Beaches'
          ? ''
          : `?beach=${encodeURIComponent(selectedBeach)}`;

      const response = await fetch(`http://localhost:5000/api/reports/download${query}`);

      if (!response.ok) {
        throw new Error('Failed to download report');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download =
        selectedBeach === 'All Beaches'
          ? 'pollution-report-all-beaches.pdf'
          : `pollution-report-${selectedBeach.replace(/\s+/g, '-').toLowerCase()}.pdf`;

      document.body.appendChild(link);
      link.click();
      link.remove();

      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download error:', error);
      alert('Failed to download report');
    }
  };

  const renderChart = (data, color, category) => {
    if (!data || data.length === 0) {
      return (
        <div className="chart-container">
          <div className="chart-header">
            <h3 className="chart-title">{category}</h3>
          </div>
          <div style={{ padding: '20px', textAlign: 'center' }}>
            No data available
          </div>
        </div>
      );
    }

    const firstWeek = Number(data[0].count);
    const lastWeek = Number(data[data.length - 1].count);

    const change =
      firstWeek === 0
        ? 0
        : (((lastWeek - firstWeek) / firstWeek) * 100).toFixed(0);

    const isPositive = Number(change) >= 0;

    return (
      <div className="chart-container">
        <div className="chart-header">
          <h3 className="chart-title">{category}</h3>

          <span className={`chart-change ${isPositive ? 'positive' : 'negative'}`}>
            {isPositive ? '+' : ''}
            {change}%
          </span>
        </div>

        <ResponsiveContainer width="100%" height={150}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffffff" />
            <XAxis dataKey="week" tick={{ fontSize: 11 }} stroke="#999" />
            <YAxis tick={{ fontSize: 11 }} stroke="#999" />
            <Tooltip />
            <Line
              type="monotone"
              dataKey="count"
              stroke={color}
              strokeWidth={3}
              fill={color}
              fillOpacity={0.3}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  };

  if (loading) {
    return <div className="reports-container">Loading reports...</div>;
  }

  return (
    <div className="reports-container">
      <div className="reports-header">
        <div className="header-title">Reports</div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button className="download-button" onClick={handleDownloadReport}>
            Download Report
          </button>

          <button className="settings-button" onClick={() => navigate('/settings')}>
            <Settings size={20} />
          </button>
        </div>
      </div>

      <div className="reports-filter-section">
        <label className="reports-filter-label">Select Beach</label>
        <select
          className="reports-filter-select"
          value={selectedBeach}
          onChange={(e) => setSelectedBeach(e.target.value)}
        >
          {beaches.map((beach) => (
            <option key={beach} value={beach}>
              {beach}
            </option>
          ))}
        </select>
      </div>

      <div className="summary-section">
        <div className="summary-card">
          <div className="summary-label">Valuables</div>
          <div className="summary-value">{summaryData.valuables}</div>
        </div>

        <div className="summary-card">
          <div className="summary-label">Plastic</div>
          <div className="summary-value">{summaryData.plastic}</div>
        </div>

        <div className="summary-card">
          <div className="summary-label">Metal</div>
          <div className="summary-value">{summaryData.metal}</div>
        </div>

        <div className="summary-card highlight">
          <div className="summary-label">Total Items Found</div>
          <div className="summary-value">{summaryData.total}</div>
        </div>
      </div>

      <div className="trends-section">
        <h2 className="section-title">
          Weekly Trends {selectedBeach !== 'All Beaches' ? `— ${selectedBeach}` : ''}
        </h2>

        {renderChart(chartData.valuables, '#9B59B6', 'Valuables')}
        {renderChart(chartData.plastic, '#E74C3C', 'Plastic')}
        {renderChart(chartData.metal, '#95A5A6', 'Metal')}
      </div>

      <div className="bottom-nav">
        <div className="nav-item" onClick={() => navigate('/dashboard')}>
          <div className="nav-icon">
            <Home size={22} />
          </div>
          <div className="nav-label">Home</div>
        </div>

        <div className="nav-item active">
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

        <div className="nav-item" onClick={() => navigate('/valuables')}>
          <div className="nav-icon">
            <Search size={22} />
          </div>
          <div className="nav-label">Lost & Found</div>
        </div>
      </div>
    </div>
  );
}

export default ReportsScreen;