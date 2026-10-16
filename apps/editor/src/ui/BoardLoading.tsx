import { cn } from '@/lib/utils';
import { Component as PencilLoader } from '@/components/ui/loader-1';
import { useT } from '../i18n';

/**
 * The pencil loader, centred, for while a board is on its way: the editor's
 * address deciding which board to open, or a board's first content still
 * arriving from the server.
 *
 * The ring is drawn in `currentColor`, set here to a grey that reads on the
 * light board and the dark one alike, so it needs no theme of its own — the
 * address check shows it before any editor, and its tokens, exist.
 *
 * `overlay` lays it over the board without taking the pointer: the board under
 * it is already usable, and drawing on it is a fine way to stop waiting.
 */
export function BoardLoading({ overlay = false }: { overlay?: boolean }) {
  const t = useT();
  return (
    <div
      role="status"
      data-testid="board-loading"
      className={cn(
        'pointer-events-none flex items-center justify-center text-[#a3a3a3]',
        overlay ? 'absolute inset-0' : 'h-full',
      )}
    >
      <PencilLoader className="size-20" />
      <span className="sr-only">{t('common.loading')}</span>
    </div>
  );
}
