import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { initializeFlightUpdates } from './app/flightUpdates';

initializeFlightUpdates();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
