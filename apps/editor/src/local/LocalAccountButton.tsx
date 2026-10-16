import { LayoutGrid, LogIn } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useT } from '../i18n';
import { leaveForAccount } from './carry';

/**
 * The local board's way to an account, beside its Share button: "Sign in", or
 * "Your boards" for someone this browser is already signed in for.
 *
 * In the share button's own chrome tokens and height, so the two read as one
 * pair — this one quieter, since drawing here needs neither.
 */
export function LocalAccountButton({ signedIn }: { signedIn: boolean }) {
  const t = useT();
  const label = t(signedIn ? 'menu.yourBoards' : 'menu.signIn');
  const Icon = signedIn ? LayoutGrid : LogIn;

  return (
    <button
      type="button"
      // Signing in brings the drawing along; see carry.ts.
      onClick={() => leaveForAccount(signedIn ? 'yourBoards' : 'signIn')}
      data-testid="local-account-button"
      className={cn(
        'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold',
        'border-(--default-border-color) bg-(--island-bg-color) text-(--text-primary-color)',
        'transition-colors hover:bg-(--button-hover-bg)',
        'focus-visible:shadow-[0_0_0_2px_var(--focus-highlight-color)] focus-visible:outline-none',
      )}
    >
      <Icon className="size-4" aria-hidden="true" />
      {label}
    </button>
  );
}
