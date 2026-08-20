import { useEffect, useRef } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ExpandingSearchDock } from '@/components/ui/expanding-search-dock';
import type { CanvasSearch } from './useCanvasSearch';

export function FindBar({ search }: { search: CanvasSearch }) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Keyed on the request counter, not on `open`, so a second ⌘F while the
  // field is already up still selects what's in it.
  useEffect(() => {
    if (search.open && search.focusRequest > 0) inputRef.current?.select();
  }, [search.open, search.focusRequest]);

  const hasQuery = search.query.trim().length > 0;
  const total = search.truncated ? `${search.matchCount}+` : String(search.matchCount);

  return (
    // Unpositioned: the top-right dock lays this out beside the collaborator
    // bar. Positioning itself is what made it cover the avatars — both were
    // pinned to the same corner, and this one paints second.
    <div>
      <ExpandingSearchDock
        expanded={search.open}
        onExpand={search.openSearch}
        onCollapse={search.closeSearch}
        query={search.query}
        onQueryChange={search.setQuery}
        onSubmit={search.goToNext}
        inputRef={inputRef}
        placeholder="Find on canvas"
        label="Find on canvas"
        onInputKeyDown={(event) => {
          if (event.key === 'Enter') {
            // Shift+Enter walks backwards; the plain form submit goes forward.
            if (event.shiftKey) {
              event.preventDefault();
              search.goToPrevious();
            }
            return;
          }
          if (event.key === 'Escape') {
            // Stopped here so the editor's global Escape doesn't also cancel
            // the active tool on the way past.
            event.preventDefault();
            event.stopPropagation();
            search.closeSearch();
          }
        }}
        trailing={
          <>
            <span
              className="shrink-0 whitespace-nowrap px-1 text-xs tabular-nums text-(--keybinding-color)"
              aria-live="polite"
            >
              {hasQuery
                ? search.matchCount === 0
                  ? 'No results'
                  : `${search.focusPosition}/${total}`
                : ''}
            </span>
            <NavButton
              label="Previous match"
              disabled={search.matchCount === 0}
              onClick={search.goToPrevious}
            >
              <ChevronUp className="h-4 w-4" aria-hidden="true" />
            </NavButton>
            <NavButton
              label="Next match"
              disabled={search.matchCount === 0}
              onClick={search.goToNext}
            >
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            </NavButton>
          </>
        }
      />
    </div>
  );
}

function NavButton({
  label,
  onClick,
  disabled = false,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={cn(
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-(--icon-fill-color) transition-colors focus-visible:shadow-[0_0_0_2px_var(--focus-highlight-color)] focus-visible:outline-none',
        disabled ? 'cursor-default opacity-35' : 'hover:bg-(--button-hover-bg)',
      )}
    >
      {children}
    </button>
  );
}
