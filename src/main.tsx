/**
 * Application entry point (HLD §7, §16).
 *
 * Loads the configuration registry before rendering. If it fails, the app renders
 * an error state and does not proceed to the canvas (HLD §16, "Registry Load
 * Failure"). On success it mounts the shell inside the Redux Provider.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { App } from './app/App';
import { RegistryError } from './app/RegistryError';
import { getRegistry } from './registry';
import { store } from './state/store';
import './index.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element #root not found.');
}
const root = createRoot(container);

try {
  // Force the registry to build now so any RegistryLoadError is caught here.
  getRegistry();
  root.render(
    <StrictMode>
      <Provider store={store}>
        <App />
      </Provider>
    </StrictMode>,
  );
} catch (error) {
  root.render(<RegistryError error={error} />);
}
