/**
 * `/register/verify` — step 2 of the two-step registration flow.
 *
 * Reads { name, email, password } from router history state (set by
 * `/register`). Note: browsers persist `history.state` to disk for
 * back/forward navigation, so this is not a strictly in-memory channel — but
 * it stays out of the URL and Referer header, which is what matters for the
 * password. If the carry-over is missing or fails the
 * `registerCarryOverSchema` parse, we redirect back to `/register` from
 * `beforeLoad` — there's nothing meaningful this page can do without those
 * fields, since the verify endpoint validates the full set in one shot.
 *
 * The single editable field is a 4-digit OTP. On verify success the user is
 * sent to `/login` with a success toast. Resend is gated by a 60-second
 * client-side countdown (matches the server-side OTP TTL — see
 * /docs/FLOWS/authentication-flow.md).
 *
 * Rate-limit handling: when the API surfaces a 429, we render a non-clearing
 * banner and disable resend.
 */
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  Link,
  createFileRoute,
  redirect,
  useNavigate,
  useRouterState,
} from '@tanstack/react-router';
import { toast } from 'sonner';

import { AuthCard } from '@/components/auth/AuthCard';
import { OtpInput } from '@/components/auth/OtpInput';
import { Button } from '@/components/ui/button';
import {
  registerUser,
  verifyOtpForRegistration,
} from '@/features/auth/api';
import { useResendCountdown } from '@/features/auth/hooks';
import {
  registerCarryOverSchema,
  type RegisterCarryOver,
} from '@/features/auth/schemas';
import { isApiError } from '@/lib/errors';

// The `authReg` key on TanStack's `HistoryState` is module-augmented in
// `src/types/history.d.ts`. At read time we re-validate the blob with zod
// because direct visits / back-forward / older tabs can land here with
// anything.

function readCarryOver(state: unknown): RegisterCarryOver | null {
  if (!state || typeof state !== 'object') return null;
  const candidate = (state as { authReg?: unknown }).authReg;
  const parsed = registerCarryOverSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

export const Route = createFileRoute('/_public/register/verify')({
  beforeLoad: ({ location }) => {
    if (!readCarryOver(location.state)) {
      throw redirect({ to: '/register' });
    }
  },
  component: VerifyPage,
});

function VerifyPage() {
  const nav = useNavigate();
  // Pull the carry-over fresh on every render so an edited tab cannot drift
  // out of sync with what's actually in history. beforeLoad already
  // guarantees this is non-null on the initial mount.
  const carry = useRouterState({
    select: (s) => readCarryOver(s.location.state),
  });

  const [otp, setOtp] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [rateLimitMessage, setRateLimitMessage] = useState<string | null>(
    null,
  );

  const { secondsLeft, isReady, restart } = useResendCountdown(60);

  const verifyMutation = useMutation({
    mutationFn: verifyOtpForRegistration,
    onSuccess: () => {
      setSubmitError(null);
      toast.success('Account created — please log in');
      void nav({
        to: '/login',
        search: { redirect: undefined },
      });
    },
    onError: (err: Error) => {
      const message = err.message || 'Verification failed';
      const status = isApiError(err) ? err.status : undefined;
      if (status === 429) {
        setRateLimitMessage(message);
      }
      setSubmitError(message);
      setOtp('');
      toast.error(message);
    },
  });

  const resendMutation = useMutation({
    mutationFn: registerUser,
    onSuccess: () => {
      toast.success('Code resent — check your inbox');
      restart();
    },
    onError: (err: Error) => {
      const message = err.message || 'Could not resend code';
      const status = isApiError(err) ? err.status : undefined;
      if (status === 429) {
        setRateLimitMessage(message);
      }
      toast.error(message);
    },
  });

  if (!carry) {
    // Defensive: beforeLoad already redirected, but in case of an edge
    // case (e.g. user manually mutating history.state mid-session) render
    // a minimal "go back" affordance instead of crashing.
    return (
      <AuthCard
        title="Verification expired"
        description="Please start over from the registration page."
      >
        <Link
          to="/register"
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Back to register
        </Link>
      </AuthCard>
    );
  }

  const onVerify = () => {
    setSubmitError(null);
    verifyMutation.mutate({ ...carry, otp });
  };

  const onResend = () => {
    if (!isReady || resendMutation.isPending || rateLimitMessage) return;
    resendMutation.mutate(carry);
  };

  const verifyDisabled =
    otp.length !== 4 || verifyMutation.isPending;

  return (
    <AuthCard
      title="Verify your email"
      description={`Enter the 4-digit code we sent to ${carry.email}.`}
      footer={
        <Link
          to="/register"
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Back to register
        </Link>
      }
    >
      <div className="flex flex-col gap-5">
        <p className="text-sm text-muted-foreground">
          OTP sent to <span className="font-medium">{carry.email}</span>
        </p>

        <OtpInput
          value={otp}
          onChange={setOtp}
          disabled={verifyMutation.isPending}
          autoFocus
          length={4}
          ariaLabel="Verification code"
        />

        {rateLimitMessage ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
          >
            {rateLimitMessage}
          </p>
        ) : submitError ? (
          <p role="alert" className="text-sm text-destructive">
            {submitError}
          </p>
        ) : null}

        <Button
          type="button"
          className="w-full"
          onClick={onVerify}
          disabled={verifyDisabled}
        >
          {verifyMutation.isPending ? 'Verifying…' : 'Verify'}
        </Button>

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Didn't get the code?
          </span>
          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={onResend}
            disabled={
              !isReady ||
              resendMutation.isPending ||
              !!rateLimitMessage
            }
          >
            {resendMutation.isPending
              ? 'Sending…'
              : isReady
                ? 'Resend code'
                : `Resend in ${secondsLeft}s`}
          </Button>
        </div>
      </div>
    </AuthCard>
  );
}
