import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_authed/dashboard')({
  component: DashboardPage,
});

function DashboardPage() {
  return (
    <div style={{ padding: '2rem' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '0.5rem' }}>
        Dashboard
      </h1>
      <p style={{ color: '#666' }}>
        FE-4 will replace this with the real shell + cards.
      </p>
    </div>
  );
}
