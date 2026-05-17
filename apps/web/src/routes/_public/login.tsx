/**
 * `/login` — email + password login form (FE-2).
 *
 * POST to `/api/no-auth/user/login` with email/password. On success, the
 * backend returns `{ userId, email }` which we store in Zustand. The
 * httpOnly refresh cookie is already set by the response. On error,
 * surface via sonner toast + inline error banner.
 *
 * Supports `?redirect=<path>` search param (validated by TanStack Router)
 * to redirect on success; defaults to `/dashboard`.
 */
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import {
  Link,
  createFileRoute,
  useNavigate,
} from '@tanstack/react-router';
import { toast } from 'sonner';

import { AuthCard } from '@/components/auth/AuthCard';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { login } from '@/features/auth/api';
import { loginSchema, type LoginInput } from '@/features/auth/schemas';
import { useAuthStore } from '@/stores/auth';

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
  const nav = useNavigate();
  const { redirect } = Route.useSearch();
  const setSession = useAuthStore((s) => s.setSession);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
    mode: 'onSubmit',
  });

  const mutation = useMutation({
    mutationFn: login,
    onSuccess: (data) => {
      setSubmitError(null);
      setSession({ userId: data.userId, email: data.email });
      toast.success('Welcome back!');
      void nav({ to: redirect ?? '/dashboard' });
    },
    onError: (err: Error) => {
      const message = err.message || 'Login failed';
      setSubmitError(message);
      toast.error(message);
    },
  });

  const onSubmit = (values: LoginInput) => {
    setSubmitError(null);
    mutation.mutate(values);
  };

  return (
    <AuthCard
      title="Welcome back"
      description="Sign in to your account"
      footer={
        <p className="text-sm text-muted-foreground">
          Don't have an account?{' '}
          <Link
            to="/register"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Create one
          </Link>
        </p>
      }
    >
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex flex-col gap-4"
          noValidate
        >
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    disabled={mutation.isPending}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Password</FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    disabled={mutation.isPending}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {submitError ? (
            <p
              role="alert"
              className="text-sm text-destructive"
            >
              {submitError}
            </p>
          ) : null}

          <Button
            type="submit"
            className="w-full"
            disabled={mutation.isPending}
          >
            {mutation.isPending ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </Form>
    </AuthCard>
  );
}
