import { cn } from '@/lib/utils';

/**
 * Base UI parts accept `className` as a string or as a function of the part's
 * own state, so a wrapper's classes cannot go straight through `cn`, which only
 * takes strings. This keeps the callback form intact and merges into its result.
 */
export function mergeClassName<State>(
  base: string,
  className: string | ((state: State) => string | undefined) | undefined,
): string | ((state: State) => string) {
  if (typeof className === 'function') {
    return (state) => cn(base, className(state));
  }
  return cn(base, className);
}
