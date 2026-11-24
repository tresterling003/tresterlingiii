import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import '@fontsource-variable/inter';
import '@fontsource-variable/bricolage-grotesque';
import './styles/index.css';
import { router } from './app/router';
import { FavoritesProvider } from './state/FavoritesProvider';
import { ThemeProvider } from './state/ThemeProvider';

// Providers wrap the whole app. Future app-wide services (e.g. an AuthProvider) go here too.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <FavoritesProvider>
        <RouterProvider router={router} />
      </FavoritesProvider>
    </ThemeProvider>
  </StrictMode>,
);
