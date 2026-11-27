// A trial of a different interface (next.html). Same layout logic as the app; its own
// storage, so nothing done here touches the projects in the app itself.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { NextApp } from './NextApp';
import '../styles.css';
import './next.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <NextApp />
  </StrictMode>,
);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}
