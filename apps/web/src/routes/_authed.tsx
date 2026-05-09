import { Outlet, createFileRoute, redirect } from '@tanstack/react-router';

import { useAuthStore } from '@/stores/auth';

export const Route = createFileRoute('/_authed')({
  beforeLoad: ({ location }) => {
    const { hydrated, isAuthenticated } = useAuthStore.getState();
    // Only enforce the guard once the boot refresh has resolved.
    if (hydrated && !isAuthenticated) {
      throw redirect({
        to: '/login',
        search: { redirect: location.pathname },
      });
    }
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  // FE-4 will replace this with the real app shell (sidebar, top bar, etc.).
  return <Outlet />;
}
