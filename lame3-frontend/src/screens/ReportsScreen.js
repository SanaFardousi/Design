import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import './ReportsScreen.css';

function ReportsScreen() {
  const navigate = useNavigate();
  
  // TODO: Later, this will come from API
  // For now, using example data
  const [summaryData] = useState({
    valuables: 5,
    plastic: 45,
    metal: 12,
    other: 10
  });

  // TODO: Later, this will come from API
  // Chart data for trends (last 4 weeks)
  const [chartData] = useState({
    valuables: [
      { week: 'Week 1', count: 2 },
      { week: 'Week 2', count: 0 },
      { week: 'Week 3', count: 1 },
      { week: 'Week 4', count: 2 },
    ],
    plastic: [
      { week: 'Week 1', count: 100 },
      { week: 'Week 2', count: 70 },
      { week: 'Week 3', count: 88 },
      { week: 'Week 4', count: 90 },
    ],
    metal: [
      { week: 'Week 1', count: 30 },
      { week: 'Week 2', count: 90 },
      { week: 'Week 3', count: 40 },
      { week: 'Week 4', count: 50 },
    ],
  });

  useEffect(() => {
    // Check if user is logged in
    const isLoggedIn = localStorage.getItem('isLoggedIn');
    if (!isLoggedIn) {
      navigate('/');
    }

    // TODO: Later, fetch real data from API
    // fetchReportsData();
  }, [navigate]);

  // TODO: Later, this function will fetch from backend
  // const fetchReportsData = async () => {
  //   const response = await fetch('http://localhost:5000/api/reports');
  //   const data = await response.json();
  //   setSummaryData(data.summary);
  //   setChartData(data.trends);
  // };

  const renderChart = (data, color, category) => {
    // Calculate percentage change
    const firstWeek = data[0].count;
    const lastWeek = data[data.length - 1].count;
    const change = firstWeek === 0 ? 0 : (((lastWeek - firstWeek) / firstWeek) * 100).toFixed(0);
    const isPositive = change >= 0;

    return (
      <div className="chart-container">
        <div className="chart-header">
          <h3 className="chart-title">{category}</h3>
          <span className={`chart-change ${isPositive ? 'positive' : 'negative'}`}>
            {isPositive ? '+' : ''}{change}%
          </span>
        </div>
        <ResponsiveContainer width="100%" height={150}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis 
              dataKey="week" 
              tick={{ fontSize: 11 }}
              stroke="#999"
            />
            <YAxis 
              tick={{ fontSize: 11 }}
              stroke="#999"
            />
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

  return (
    <div className="reports-container">
      {/* Header */}
      <div className="reports-header">
        <div className="header-title">Reports</div>
        <button className="settings-button">⚙️</button>
      </div>

      {/* Summary Cards */}
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
          <div className="summary-value">{summaryData.other}</div>
        </div>
      </div>

      {/* Trends Section */}
      <div className="trends-section">
        <h2 className="section-title">Trends over 30 days</h2>

        {renderChart(chartData.valuables, '#9B59B6', 'Valuables')}
        {renderChart(chartData.plastic, '#E74C3C', 'Plastic')}
        {renderChart(chartData.metal, '#95A5A6', 'Metal')}
      </div>

      {/* Note for Development */}
      <div className="dev-note">
        📊 Currently showing example data. Will display real data from robot once backend is connected.
      </div>

      {/* Bottom Navigation */}
      <div className="bottom-nav">
        <div className="nav-item" onClick={() => navigate('/dashboard')}>
          <div className="nav-icon">🏠</div>
          <div className="nav-label">Home</div>
        </div>
        <div className="nav-item active">
          <div className="nav-icon">📊</div>
          <div className="nav-label">Reports</div>
        </div>
        <div className="nav-item">
          <div className="nav-icon">🎮</div>
          <div className="nav-label">Robot Control</div>
        </div>
        <div className="nav-item">
          <div className="nav-icon">🔍</div>
          <div className="nav-label">Lost & Found</div>
        </div>
      </div>
    </div>
  );
}

export default ReportsScreen;