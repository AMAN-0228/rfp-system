import { lazy, Suspense } from 'react';
import { Outlet, createRootRoute } from '@tanstack/react-router';

// Devtools are dev-only — Vite tree-shakes the lazy import out of the
// production bundle because the conditional is statically false at build.
const ReactQueryDevtools = import.meta.env.DEV
  ? lazy(() =>
      import('@tanstack/react-query-devtools').then((m) => ({
        default: m.ReactQueryDevtools,
      })),
    )
  : null;

const TanStackRouterDevtools = import.meta.env.DEV
  ? lazy(() =>
      import('@tanstack/router-devtools').then((m) => ({
        default: m.TanStackRouterDevtools,
      })),
    )
  : null;

export const Route = createRootRoute({
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootComponent() {
  return (
    <>
      <Outlet />
      {ReactQueryDevtools && TanStackRouterDevtools && (
        <Suspense fallback={null}>
          <ReactQueryDevtools buttonPosition="bottom-right" />
          <TanStackRouterDevtools position="bottom-left" />
        </Suspense>
      )}
    </>
  );
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
