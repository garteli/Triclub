import React from 'react';
import { createRoot } from 'react-dom/client';
import './lib/apiBase.js';   // install the native API-base fetch shim before anything fetches
import './theme.css';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
