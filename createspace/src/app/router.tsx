import { createBrowserRouter } from 'react-router';
import { AppShell } from '@/components/layout/AppShell';
import { AllToolsPage } from '@/pages/AllToolsPage';
import { CategoryPage } from '@/pages/CategoryPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { FavoritesPage } from '@/pages/FavoritesPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { RequestToolPage } from '@/pages/RequestToolPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { ToolPage } from '@/pages/ToolPage';
import { WhatsNewPage } from '@/pages/WhatsNewPage';

/** Every page address in the app. Individual tools don't need entries: /tools/:toolId covers them all. */
export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { path: '/', element: <DashboardPage /> },
      { path: '/tools', element: <AllToolsPage /> },
      { path: '/tools/:toolId', element: <ToolPage /> },
      { path: '/category/:categoryId', element: <CategoryPage /> },
      { path: '/favorites', element: <FavoritesPage /> },
      { path: '/settings', element: <SettingsPage /> },
      { path: '/whats-new', element: <WhatsNewPage /> },
      { path: '/request-tool', element: <RequestToolPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
