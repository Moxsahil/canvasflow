import type { ReactNode } from 'react';

/** A word in the middle of the panel, where its items would be: empty, loading, or why not. */
export function PanelNote({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex h-full min-h-32 flex-col items-center justify-center gap-1 px-6 text-center text-xs">
      <p className="font-semibold">{title}</p>
      {children && (
        <div className="flex flex-col items-center text-neutral-500 dark:text-neutral-400">
          {children}
        </div>
      )}
    </div>
  );
}
