import { Outlet, createRootRoute } from '@tanstack/react-router';

export const Route = createRootRoute({
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootComponent() {
  return <Outlet />;
}

function NotFoundComponent() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        fontSize: '2rem',
        fontWeight: 600,
      }}
    >
      404
    </div>
  );
}

function ErrorComponent({ error }: { error: Error }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: '2rem',
        gap: '0.5rem',
      }}
    >
      <h1 style={{ fontSize: '1.5rem', fontWeight: 600 }}>Something went wrong</h1>
      <p style={{ color: '#666' }}>{error.message}</p>
    </div>
  );
}
