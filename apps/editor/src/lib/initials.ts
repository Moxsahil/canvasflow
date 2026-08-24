/**
 * The letters a card's badge stands in with, from whatever it is naming.
 *
 * Shared by the dialogs that lead with an avatar, so a board is abbreviated
 * the same way whichever one you opened.
 */
export function initialsOf(label: string): string {
  return (
    label
      .trim()
      .split(/\s+/)
      .map((word) => word[0] ?? '')
      .join('')
      .toUpperCase()
      .slice(0, 2) || '?'
  );
}
