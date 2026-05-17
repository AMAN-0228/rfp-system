import './styles/globals.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { Toaster } from 'sonner';

import { queryClient } from '@/lib/queryClient';
import { bootstrapAuth } from '@/features/auth/api';
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

// Bootstrap auth on first mount: attempt a single refresh, populate the auth
// store with userId/email if successful, then mark hydrated so route guards
// can proceed. Mark hydrated regardless of success so unauthed routes can
// render during the boot phase.
void bootstrapAuth()
  .then((session) => {
    if (session) {
      useAuthStore.getState().setSession(session);
    }
  })
  .catch(() => {
    // Silence bootstrap errors; unauthenticated users should proceed.
  })
  .finally(() => {
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
