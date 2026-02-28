import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import LoginScreen from './screens/LoginScreen';
import DashboardScreen from './screens/DashboardScreen';
import ReportsScreen from './screens/ReportsScreen';
import RobotControlScreen from './screens/Robotcontrolscreen';
import ScheduleScreen from './screens/Schedulescreen';
import ValuablesScreen from './screens/Valuablesscreen';
import SettingsScreen from './screens/Settingsscreen';
import './App.css';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<LoginScreen />} />
        <Route path="/dashboard" element={<DashboardScreen />} />
        <Route path="/reports" element={<ReportsScreen />} />
        <Route path="/robot-control" element={<RobotControlScreen />} />
        <Route path="/schedule" element={<ScheduleScreen />} />
        <Route path="/valuables" element={<ValuablesScreen />} />
        <Route path="/settings" element={<SettingsScreen />} />
      </Routes>
    </Router>
  );
}

export default App;