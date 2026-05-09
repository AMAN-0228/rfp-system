import './styles/globals.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { Toaster } from 'sonner';

import { queryClient } from '@/lib/queryClient';
import { runRefresh } from '@/lib/refresh';
import { useAuthStore } from '@/stores/auth';
import { routeTree } from './routeTree.gen';

const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

// Bootstrap auth on first mount: attempt a single refresh, then mark hydrated
// regardless of outcome so route guards can run. FE-15 will replace this with a
// /me call that also calls setSession when the session is valid.
void runRefresh().finally(() => {
  useAuthStore.getState().markHydrated();
});

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Root element #root not found');
}

createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster richColors position="top-right" />
    </QueryClientProvider>
  </StrictMode>,
);
