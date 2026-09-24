'use client';

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { authStyles } from '@/components/auth/auth-shell';
import { cn } from '@/lib/utils';
import { PASSWORD_MAX_LENGTH, PASSWORD_RULES } from '@/features/auth/password-rules';

/**
 * One password input with its own show/hide button.
 *
 * Each field owns its toggle. Revealing one never reveals another: somebody
 * checking what they typed in the first box has not asked to show the second,
 * and a screen shared or watched over a shoulder should show exactly what was
 * chosen to be shown.
 */
export function PasswordInput({
  label,
  value,
  onChange,
  autoComplete,
  minLength,
  autoFocus,
  invalid = false,
}: {
  /** Placeholder and accessible name, e.g. "Confirm password". */
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: 'new-password' | 'current-password';
  minLength?: number;
  autoFocus?: boolean;
  invalid?: boolean;
}) {
  const [shown, setShown] = useState(false);

  return (
    <div className="relative">
      <input
        type={shown ? 'text' : 'password'}
        placeholder={label}
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        minLength={minLength}
        maxLength={autoComplete === 'new-password' ? PASSWORD_MAX_LENGTH : undefined}
        required
        autoFocus={autoFocus}
        aria-invalid={invalid}
        // `pr-12` through cn so it replaces the field's own right padding
        // rather than racing it; the value then runs under the button
        // instead of behind it.
        className={cn(
          authStyles.field,
          'pr-12',
          invalid && 'border-red-400/50 focus:border-red-400/70',
        )}
      />
      <button
        // Not a submit: a bare button inside a form posts it, so revealing
        // the password would send the form.
        type="button"
        onClick={() => setShown((v) => !v)}
        aria-label={shown ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
        aria-pressed={shown}
        className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-white/35 transition-colors hover:text-white/80 focus:outline-none focus-visible:text-[#F5F4F0]"
      >
        {shown ? (
          <EyeOff className="size-4" aria-hidden="true" />
        ) : (
          <Eye className="size-4" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}

/**
 * Choosing a password: the password, a second field to confirm it, and the
 * live rules checklist.
 *
 * Shared by signup and reset so both look and behave the same, and so the
 * checklist cannot say one thing on one form and another on the other.
 *
 * The confirmation is a typing check and nothing more. It never leaves the
 * browser: the gateway is sent the password once, and has no use for a
 * second copy of something it already has.
 */
export function NewPasswordField({
  value,
  onChange,
  confirmation,
  onConfirmationChange,
  placeholder = 'Password',
  confirmPlaceholder = 'Confirm password',
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  confirmation: string;
  onConfirmationChange: (value: string) => void;
  placeholder?: string;
  confirmPlaceholder?: string;
  autoFocus?: boolean;
}) {
  const mismatched = confirmation.length > 0 && confirmation !== value;

  return (
    <>
      <PasswordInput
        label={placeholder}
        value={value}
        onChange={onChange}
        autoComplete="new-password"
        minLength={8}
        autoFocus={autoFocus}
      />
      <PasswordInput
        label={confirmPlaceholder}
        value={confirmation}
        onChange={onConfirmationChange}
        autoComplete="new-password"
        invalid={mismatched}
      />

      {/* Only once there is something to check — an untouched form should not
          open with a list of things already failed. Two columns, so the list
          adds three short rows rather than five and the form still fits on a
          laptop screen without scrolling. */}
      {value.length > 0 && (
        <ul className="grid grid-cols-2 gap-x-4 gap-y-1" aria-live="polite">
          {PASSWORD_RULES.map((rule) => (
            <Rule key={rule.label} label={rule.label} met={rule.test(value)} />
          ))}
          {/* Listed only once the second field has been started, for the same
              reason the rules wait for the first. */}
          {confirmation.length > 0 && <Rule label="Passwords match" met={!mismatched} />}
        </ul>
      )}
    </>
  );
}

function Rule({ label, met }: { label: string; met: boolean }) {
  return (
    <li
      className={`flex items-center gap-2 text-xs transition-colors ${
        met ? 'text-emerald-400' : 'text-white/40'
      }`}
    >
      <span
        aria-hidden="true"
        className={`h-1 w-1 shrink-0 rounded-full ${met ? 'bg-emerald-400' : 'bg-white/25'}`}
      />
      {label}
    </li>
  );
}
