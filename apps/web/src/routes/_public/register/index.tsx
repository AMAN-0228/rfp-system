/**
 * `/register` — step 1 of the two-step registration flow.
 *
 * Form: name + email + password. On submit we POST to the register endpoint
 * (which generates the 4-digit OTP and emails it) and navigate to
 * `/register/verify`. The carry-over { name, email, password } rides in
 * router history state — never URL params, because the password must not
 * land in the address bar, browser history, or referrer headers.
 *
 * Errors flow through `ApiError` from the API client and surface both as a
 * sonner toast (transient) and an inline banner (persistent until next
 * submit).
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
import { registerUser } from '@/features/auth/api';
import {
  registerSchema,
  type RegisterInput,
} from '@/features/auth/schemas';

export const Route = createFileRoute('/_public/register/')({
  component: RegisterPage,
});

function RegisterPage() {
  const nav = useNavigate();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', password: '' },
    mode: 'onSubmit',
  });

  const mutation = useMutation({
    mutationFn: registerUser,
    onSuccess: (_data, vars) => {
      setSubmitError(null);
      // Carry { name, email, password } through router state (in-memory,
      // never URL). The verify route reads this back via useRouterState.
      // The `authReg` key is module-augmented onto TanStack's
      // `HistoryState` from `./verify` — re-validated with zod at read
      // time so direct visits with a stale shape bounce back to /register.
      void nav({
        to: '/register/verify',
        state: (prev) => ({ ...prev, authReg: vars }),
      });
    },
    onError: (err: Error) => {
      const message = err.message || 'Registration failed';
      setSubmitError(message);
      toast.error(message);
    },
  });

  const onSubmit = (values: RegisterInput) => {
    setSubmitError(null);
    mutation.mutate(values);
  };

  return (
    <AuthCard
      title="Create your account"
      description="We'll email you a 4-digit code to verify your email."
      footer={
        <p className="text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link
            to="/login"
            search={{ redirect: undefined }}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Log in
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
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input
                    type="text"
                    autoComplete="name"
                    placeholder="Jane Doe"
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
                    autoComplete="new-password"
                    placeholder="At least 8 characters"
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
            {mutation.isPending ? 'Sending code…' : 'Continue'}
          </Button>
        </form>
      </Form>
    </AuthCard>
  );
}
