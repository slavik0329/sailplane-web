import React from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import App from './App';
import Download from './Download';

export default function AppRoutes() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/download/:cid/:path" element={<Download />} />
      </Routes>
    </Router>
  );
}
