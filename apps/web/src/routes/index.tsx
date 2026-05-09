import { createFileRoute, redirect } from '@tanstack/react-router';

import { useAuthStore, waitForHydration } from '@/stores/auth';

export const Route = createFileRoute('/')({
  // Block until the boot refresh has resolved — only then can we know which
  // way to redirect. Without this, the index would render IndexComponent
  // and never re-evaluate when hydration completes.
  beforeLoad: async () => {
    await waitForHydration();
    const { isAuthenticated } = useAuthStore.getState();
    if (isAuthenticated) {
      throw redirect({ to: '/dashboard' });
    }
    throw redirect({ to: '/login', search: { redirect: undefined } });
  },
  pendingComponent: IndexComponent,
  component: IndexComponent,
});

function IndexComponent() {
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
