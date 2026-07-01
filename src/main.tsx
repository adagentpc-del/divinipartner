import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './theme.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Register the service worker for offline event-day support. Guarded so it only
// runs in a production build and only when the browser supports it; dev is never
// affected (StrictMode double-invokes effects, but this is a one-time top-level
// side effect outside React, so there is no double registration in dev).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${base}/sw.js`).catch(() => {
      /* offline support is best-effort; ignore registration failures */
    });
  });
}
