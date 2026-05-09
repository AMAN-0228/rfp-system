import { createFileRoute, redirect } from '@tanstack/react-router';

import { useAuthStore } from '@/stores/auth';

export const Route = createFileRoute('/')({
  beforeLoad: () => {
    const { hydrated, isAuthenticated } = useAuthStore.getState();
    // Wait for hydration before deciding — let the boot resolve and re-run.
    if (!hydrated) return;
    if (isAuthenticated) {
      throw redirect({ to: '/dashboard' });
    }
    throw redirect({ to: '/login', search: { redirect: undefined } });
  },
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
