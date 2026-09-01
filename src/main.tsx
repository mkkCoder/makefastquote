import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { useApp, flushSave } from './store';
import './styles.css';

// Theme is applied before React mounts so there is no flash of the wrong
// theme on a hard reload.
try {
  const stored = localStorage.getItem('mfq.theme.v1');
  if (stored === 'light' || stored === 'dark') document.documentElement.dataset.theme = stored;
} catch {
  /* storage disabled */
}

// Flush the debounced autosave when the page goes away. `pagehide` rather than
// `beforeunload` because iOS Safari does not reliably fire the latter, and a
// freelancer closing a tab on their phone should not lose the last 400 ms of
// typing.
window.addEventListener('pagehide', () => {
  flushSave(useApp.getState().doc);
});

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
