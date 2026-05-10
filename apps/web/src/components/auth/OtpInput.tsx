/**
 * Boxed OTP input. Renders `length` single-character inputs side by side and
 * presents them to the parent as a single concatenated string.
 *
 * Behaviour:
 *  - Digit keystroke: write digit, advance focus to next box.
 *  - Backspace on empty box: clear previous box and retreat focus.
 *  - ArrowLeft / ArrowRight: walk between boxes.
 *  - Paste of N digits: fill the first N boxes, focus the last filled box,
 *    fire a single `onChange` with the stitched value.
 *  - Non-digit input: silently dropped.
 *
 * Default `length` is 4 to mirror the backend's 4-digit OTP
 * (`Math.floor(1000 + random * 9000)` — see /docs/FLOWS/authentication-flow.md).
 * The prop is exposed because FE-3's password-reset flow shares this
 * component and may use a different length.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ChangeEvent,
  type ClipboardEvent,
  type KeyboardEvent,
} from 'react';

import { cn } from '@/lib/utils';

export interface OtpInputProps {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  length?: number;
  ariaLabel?: string;
}

export function OtpInput({
  value,
  onChange,
  disabled,
  autoFocus,
  length = 4,
  ariaLabel = 'One-time code',
}: OtpInputProps) {
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

  // Indices used to render the boxes; memoised so React keys stay stable.
  const slots = useMemo(
    () => Array.from({ length }, (_, i) => i),
    [length],
  );

  // Always treat the canonical value as the parent-supplied string,
  // expanded into a fixed-length array so each input has a deterministic
  // source slot. Empty slots are represented as `''`.
  const chars = useMemo<string[]>(() => {
    const digits = value.replace(/\D/g, '').slice(0, length).split('');
    while (digits.length < length) digits.push('');
    return digits;
  }, [value, length]);

  useEffect(() => {
    if (autoFocus && !disabled) {
      inputsRef.current[0]?.focus();
    }
  }, [autoFocus, disabled]);

  const setCharAt = useCallback(
    (index: number, char: string) => {
      const next = [...chars];
      next[index] = char;
      // Empty slots are `''`, so join() yields a clean string of digits
      // followed by nothing — no trimming required.
      onChange(next.join(''));
    },
    [chars, onChange],
  );

  const focusBox = useCallback((index: number) => {
    const clamped = Math.max(0, Math.min(index, length - 1));
    inputsRef.current[clamped]?.focus();
    inputsRef.current[clamped]?.select();
  }, [length]);

  const handleChange = (
    e: ChangeEvent<HTMLInputElement>,
    index: number,
  ) => {
    const raw = e.target.value;
    // If the browser delivered a multi-character value (e.g. some autofill
    // managers, or a paste that bypassed onPaste), treat it as a paste.
    const digits = raw.replace(/\D/g, '');
    if (digits.length === 0) {
      setCharAt(index, '');
      return;
    }
    if (digits.length === 1) {
      setCharAt(index, digits);
      if (index < length - 1) focusBox(index + 1);
      return;
    }
    // Multi-digit: distribute into successive boxes starting at `index`.
    const next = [...chars];
    for (let i = 0; i < digits.length && index + i < length; i += 1) {
      next[index + i] = digits[i] ?? '';
    }
    onChange(next.join(''));
    const lastFilled = Math.min(index + digits.length - 1, length - 1);
    focusBox(lastFilled);
  };

  const handleKeyDown = (
    e: KeyboardEvent<HTMLInputElement>,
    index: number,
  ) => {
    if (e.key === 'Backspace') {
      if (chars[index]) {
        setCharAt(index, '');
        return;
      }
      if (index > 0) {
        e.preventDefault();
        setCharAt(index - 1, '');
        focusBox(index - 1);
      }
      return;
    }
    if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      focusBox(index - 1);
      return;
    }
    if (e.key === 'ArrowRight' && index < length - 1) {
      e.preventDefault();
      focusBox(index + 1);
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '');
    if (!pasted) return;
    e.preventDefault();
    const sliced = pasted.slice(0, length);
    onChange(sliced);
    focusBox(Math.min(sliced.length, length) - 1);
  };

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="flex items-center justify-center gap-2"
    >
      {slots.map((i) => (
        <input
          key={i}
          ref={(el) => {
            inputsRef.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          pattern="\d*"
          maxLength={1}
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          disabled={disabled}
          value={chars[i] ?? ''}
          onChange={(e) => handleChange(e, i)}
          onKeyDown={(e) => handleKeyDown(e, i)}
          onPaste={handlePaste}
          aria-label={`${ariaLabel} digit ${i + 1}`}
          className={cn(
            'h-12 w-12 text-center text-xl font-mono rounded-md border border-input bg-background',
            'focus:outline-none focus:ring-2 focus:ring-ring',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          )}
        />
      ))}
    </div>
  );
}
