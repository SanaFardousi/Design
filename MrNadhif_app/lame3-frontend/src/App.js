import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import LoginScreen from './screens/LoginScreen';
import DashboardScreen from './screens/DashboardScreen';
import ReportsScreen from './screens/ReportsScreen';
import './App.css';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<LoginScreen />} />
        <Route path="/dashboard" element={<DashboardScreen />} />
        <Route path="/reports" element={<ReportsScreen />} />
      </Routes>
    </Router>
  );
}

export default App;

