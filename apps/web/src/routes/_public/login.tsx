import { createFileRoute } from '@tanstack/react-router';

type LoginSearch = {
  redirect: string | undefined;
};

export const Route = createFileRoute('/_public/login')({
  validateSearch: (s: Record<string, unknown>): LoginSearch => ({
    redirect: typeof s.redirect === 'string' ? s.redirect : undefined,
  }),
  component: LoginPage,
});

function LoginPage() {
  return (
    <div style={{ padding: '2rem' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '0.5rem' }}>
        Login
      </h1>
      <p style={{ color: '#666' }}>
        FE-2 will implement the login form here.
      </p>
    </div>
  );
}
