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

// Bootstrap auth on first mount: attempt a single refresh, mark
// isAuthenticated if the cookie is valid, then mark hydrated regardless so
// route guards (which await hydration) can resolve. FE-15 will replace this
// with a /me fetch that also populates userId/email via setSession.
void runRefresh()
  .then((ok) => {
    if (ok) useAuthStore.getState().markAuthenticated();
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
