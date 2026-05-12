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
 * Internals: the interval is held in a ref so it is created once at mount
 * (or on `restart()`) and cleared once when the countdown hits zero —
 * instead of being torn down and recreated on every tick, which was the
 * prior behaviour when `secondsLeft` was in the effect's dep array.
 *
 * Returns:
 *  - `secondsLeft` — current countdown value, 0 once the cooldown ends.
 *  - `isReady`     — convenience flag (`secondsLeft === 0`).
 *  - `restart()`   — resets the timer back to the initial `seconds`
 *                    argument; called after a successful resend.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseResendCountdown {
  secondsLeft: number;
  isReady: boolean;
  restart: () => void;
}

export function useResendCountdown(seconds: number): UseResendCountdown {
  const [secondsLeft, setSecondsLeft] = useState<number>(seconds);
  const intervalRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    if (intervalRef.current !== null) return;
    intervalRef.current = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearTimer();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [clearTimer]);

  useEffect(() => {
    startTimer();
    return clearTimer;
  }, [startTimer, clearTimer]);

  const restart = useCallback(() => {
    setSecondsLeft(seconds);
    startTimer();
  }, [seconds, startTimer]);

  return {
    secondsLeft,
    isReady: secondsLeft === 0,
    restart,
  };
}
