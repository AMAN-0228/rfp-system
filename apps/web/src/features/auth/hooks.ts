/**
 * Resend-OTP countdown hook.
 *
 * Backs the "Resend code in Ns" UI on the verify-OTP screen. Server-side
 * the OTP is valid for 60 seconds (see `otp:{email}` TTL in
 * /docs/FLOWS/authentication-flow.md), and a fresh `register` call within
 * that window returns 400 because the previous OTP is still pending. We
 * mirror that 60s window client-side so the resend button only becomes
 * clickable once the server will actually accept a new request.
 *
 * Returns:
 *  - `secondsLeft` — current countdown value, 0 once the cooldown ends.
 *  - `isReady`     — convenience flag (`secondsLeft === 0`).
 *  - `restart()`   — resets the timer back to the initial `seconds`
 *                    argument; called after a successful resend.
 */
import { useCallback, useEffect, useState } from 'react';

export interface UseResendCountdown {
  secondsLeft: number;
  isReady: boolean;
  restart: () => void;
}

export function useResendCountdown(seconds: number): UseResendCountdown {
  const [secondsLeft, setSecondsLeft] = useState<number>(seconds);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = window.setInterval(() => {
      setSecondsLeft((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => {
      window.clearInterval(id);
    };
  }, [secondsLeft]);

  const restart = useCallback(() => {
    setSecondsLeft(seconds);
  }, [seconds]);

  return {
    secondsLeft,
    isReady: secondsLeft === 0,
    restart,
  };
}
