import { Outlet, createFileRoute, redirect } from '@tanstack/react-router';

import { useAuthStore, waitForHydration } from '@/stores/auth';

export const Route = createFileRoute('/_authed')({
  // `beforeLoad` is awaited before the route component renders, so awaiting
  // hydration here closes the window where unauthenticated users could
  // briefly see protected content during the initial boot refresh.
  beforeLoad: async ({ location }) => {
    await waitForHydration();
    const { isAuthenticated } = useAuthStore.getState();
    if (!isAuthenticated) {
      throw redirect({
        to: '/login',
        search: { redirect: location.pathname },
      });
    }
  },
  pendingComponent: PendingComponent,
  component: AuthedLayout,
});

function AuthedLayout() {
  // FE-4 will replace this with the real app shell (sidebar, top bar, etc.).
  return <Outlet />;
}

function PendingComponent() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        color: '#666',
      }}
    >
      Loading…
    </div>
  );
}
