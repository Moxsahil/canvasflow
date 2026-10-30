import type { KeyboardEvent } from 'react';

const STEPS: Readonly<Record<string, number>> = {
  ArrowDown: 1,
  ArrowRight: 1,
  ArrowUp: -1,
  ArrowLeft: -1,
};

/**
 * Arrow keys for a group of buttons playing radio: as with native radios, an
 * arrow picks the next or previous choice (wrapping at the ends), Home and End
 * the first and last, and focus moves with the pick. Give the group this as
 * its `onKeyDown`, list `options` in the order the buttons appear, and make
 * only the picked button tabbable (`tabIndex={picked ? 0 : -1}`), so Tab
 * enters and leaves the group in one step.
 */
export function radioKeys<T>(
  options: readonly T[],
  value: T,
  onChange: (next: T) => void,
): (event: KeyboardEvent<HTMLElement>) => void {
  return (event) => {
    const last = options.length - 1;
    const index = options.indexOf(value);
    let next: number;
    if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = last;
    else if (event.key in STEPS)
      next = (index + STEPS[event.key]! + options.length) % options.length;
    else return;
    event.preventDefault();
    onChange(options[next]!);
    event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus();
  };
}
