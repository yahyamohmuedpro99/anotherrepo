import { createRoot } from 'react-dom/client';
import '@fontsource/ibm-plex-sans-arabic/400.css';
import '@fontsource/ibm-plex-sans-arabic/600.css';
import '@fontsource/reem-kufi/600.css';
import '@fontsource/aref-ruqaa/700.css';
import '@rihla/ui/styles.css';
import './studio.css';
import { StudioProvider } from './lib/store';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StudioProvider>
    <App />
  </StudioProvider>,
);
