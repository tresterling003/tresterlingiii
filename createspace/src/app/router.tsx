import { createBrowserRouter, createMemoryRouter, Navigate, type RouteObject } from 'react-router';
import { AppShell } from '@/components/layout/AppShell';
import { AllToolsPage } from '@/pages/AllToolsPage';
import { CategoryPage } from '@/pages/CategoryPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { NewProjectPage } from '@/pages/NewProjectPage';
import { ProjectPage } from '@/pages/ProjectPage';
import { ProjectsPage } from '@/pages/ProjectsPage';
import { SuggestPage } from '@/pages/SuggestPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { ToolPage } from '@/pages/ToolPage';
import { WhatsNewPage } from '@/pages/WhatsNewPage';

/** Every page address in the app. Individual tools don't need entries: /tools/:toolId covers them all. */
const routes: RouteObject[] = [
  {
    element: <AppShell />,
    children: [
      { path: '/', element: <DashboardPage /> },
      { path: '/tools', element: <AllToolsPage /> },
      { path: '/tools/:toolId', element: <ToolPage /> },
      { path: '/category/:categoryId', element: <CategoryPage /> },
      // Favorites now live at the top of Home
      { path: '/favorites', element: <Navigate to="/" replace /> },
      { path: '/settings', element: <SettingsPage /> },
      { path: '/whats-new', element: <WhatsNewPage /> },
      { path: '/projects', element: <ProjectsPage /> },
      { path: '/projects/new', element: <NewProjectPage /> },
      { path: '/projects/:projectId', element: <ProjectPage /> },
      { path: '/suggest', element: <SuggestPage /> },
      // old address from v0.1.0
      { path: '/request-tool', element: <Navigate to="/suggest" replace /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

/**
 * Normal builds use real addresses (/tools/color-studio).
 * The "embedded" build (npm run build:embedded) is for hosts that show the app inside a frame
 * where the address bar can't be changed, such as a claude.ai hosted page. There, navigation is
 * kept in memory instead. Everything else works the same.
 */
export const router = import.meta.env.MODE === 'embedded' ? createMemoryRouter(routes) : createBrowserRouter(routes);
