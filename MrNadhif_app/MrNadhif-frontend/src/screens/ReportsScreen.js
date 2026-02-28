// ================= IMPORTS =================

// Import React and hooks
// useState -> stores component data
// useEffect -> runs code when component loads
import React, { useState, useEffect } from 'react';

// useNavigate allows navigation between pages
import { useNavigate } from 'react-router-dom';

// Import chart components from Recharts library
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';

// Import SVG icons (same style used in Dashboard)
import {
  Settings,
  Home,
  BarChart2,
  Gamepad2,
  Search
} from 'lucide-react';

// Import CSS styling
import './ReportsScreen.css';


// ================= COMPONENT =================

function ReportsScreen() {

  // Allows us to programmatically move between routes
  const navigate = useNavigate();


  // ================= STATE =================

  /*
    summaryData stores the numbers displayed
    in the summary cards at the top.
    
    Currently this is example data.
    Later, this will come from backend API.
  */
  const [summaryData] = useState({
    valuables: 5,
    plastic: 45,
    metal: 12,
    other: 10
  });


  /*
    chartData stores weekly trend data
    for each category.

    Each object contains:
    - week -> X-axis label
    - count -> Y-axis value
  */
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


  // ================= AUTH CHECK =================

  /*
    When page loads:
    - Check if user is logged in
    - If not -> redirect to login page
  */
  useEffect(() => {
    const isLoggedIn = localStorage.getItem('isLoggedIn');

    if (!isLoggedIn) {
      navigate('/');
    }

  }, [navigate]);


  // ================= CHART RENDER FUNCTION =================

  /*
    This function builds a reusable chart component.

    Parameters:
    - data -> weekly data array
    - color -> line color
    - category -> chart title
  */
  const renderChart = (data, color, category) => {

    // Get first week's value
    const firstWeek = data[0].count;

    // Get last week's value
    const lastWeek = data[data.length - 1].count;

    /*
      Calculate percentage change:
      ((last - first) / first) * 100
    */
    const change =
      firstWeek === 0
        ? 0
        : (((lastWeek - firstWeek) / firstWeek) * 100).toFixed(0);

    // Determine if trend is positive or negative
    const isPositive = change >= 0;

    return (
      <div className="chart-container">

        {/* Chart title and percentage indicator */}
        <div className="chart-header">
          <h3 className="chart-title">{category}</h3>

          <span
            className={`chart-change ${isPositive ? 'positive' : 'negative'}`}
          >
            {isPositive ? '+' : ''}
            {change}%
          </span>
        </div>

        {/* Responsive chart wrapper */}
        <ResponsiveContainer width="100%" height={150}>
          <LineChart data={data}>

            {/* Grid lines */}
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />

            {/* X-axis labels (weeks) */}
            <XAxis
              dataKey="week"
              tick={{ fontSize: 11 }}
              stroke="#999"
            />

            {/* Y-axis values */}
            <YAxis
              tick={{ fontSize: 11 }}
              stroke="#999"
            />

            {/* Tooltip on hover */}
            <Tooltip />

            {/* The actual line */}
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


  // ================= UI =================

  return (
    <div className="reports-container">

      {/* HEADER SECTION */}
      <div className="reports-header">
        <div className="header-title">Reports</div>

        {/* Settings icon (SVG instead of emoji) */}
        <button className="settings-button">
          <Settings size={20} />
        </button>
      </div>


      {/* SUMMARY CARDS */}
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


      {/* TRENDS SECTION */}
      <div className="trends-section">
        <h2 className="section-title">Trends over 30 days</h2>

        {/* Render charts using reusable function */}
        {renderChart(chartData.valuables, '#9B59B6', 'Valuables')}
        {renderChart(chartData.plastic, '#E74C3C', 'Plastic')}
        {renderChart(chartData.metal, '#95A5A6', 'Metal')}
      </div>


      {/* DEVELOPMENT NOTE */}
      <div className="dev-note">
        Currently showing example data.
        Real robot data will be loaded from backend API.
      </div>


      {/* BOTTOM NAVIGATION (Using SVG icons) */}
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

        <div className="nav-item">
          <div className="nav-icon">
            <Gamepad2 size={22} />
          </div>
          <div className="nav-label">Robot Control</div>
        </div>

        <div className="nav-item">
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