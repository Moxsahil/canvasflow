import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Search, X } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * A search affordance that lives as an icon and expands into a field.
 *
 * Controlled rather than self-contained: the editor opens it from the menu and
 * from ⌘F as well as from this button, and the query drives a live search, so
 * ownership of `expanded` and `query` belongs to the caller. Colours come from
 * the editor's theme tokens rather than shadcn's `--card`/`--muted`, which this
 * project doesn't define.
 */
export interface ExpandingSearchDockProps {
  expanded: boolean;
  onExpand: () => void;
  onCollapse: () => void;
  query: string;
  onQueryChange: (query: string) => void;
  onSubmit?: () => void;
  onInputKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  inputRef?: React.Ref<HTMLInputElement>;
  placeholder?: string;
  /** Accessible name for the collapsed button and the field. */
  label?: string;
  /** Sits between the field and the close button — a counter, navigation. */
  trailing?: React.ReactNode;
  /** Width of the expanded field. */
  expandedWidth?: number;
  className?: string;
}

const COLLAPSED_SIZE = 40;

export function ExpandingSearchDock({
  expanded,
  onExpand,
  onCollapse,
  query,
  onQueryChange,
  onSubmit,
  onInputKeyDown,
  inputRef,
  placeholder = 'Search…',
  label = 'Search',
  trailing,
  expandedWidth = 380,
  className,
}: ExpandingSearchDockProps) {
  return (
    <div className={cn('relative flex justify-end', className)}>
      <AnimatePresence mode="wait" initial={false}>
        {!expanded ? (
          <motion.button
            key="icon"
            type="button"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            onClick={onExpand}
            title={label}
            aria-label={label}
            aria-expanded={false}
            style={{ width: COLLAPSED_SIZE, height: COLLAPSED_SIZE }}
            className="flex items-center justify-center rounded-full border border-(--default-border-color) bg-(--island-bg-color) text-(--icon-fill-color) shadow-(--shadow-island) transition-colors hover:bg-(--button-hover-bg) focus-visible:shadow-[0_0_0_2px_var(--focus-highlight-color)] focus-visible:outline-none"
          >
            <Search className="h-4 w-4" aria-hidden="true" />
          </motion.button>
        ) : (
          <motion.form
            key="input"
            initial={{ width: COLLAPSED_SIZE, opacity: 0 }}
            animate={{ width: expandedWidth, opacity: 1 }}
            exit={{ width: COLLAPSED_SIZE, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            onSubmit={(event) => {
              event.preventDefault();
              onSubmit?.();
            }}
            className="relative"
          >
            <div
              style={{ height: COLLAPSED_SIZE }}
              className="relative flex items-center gap-1 overflow-hidden rounded-full border border-(--default-border-color) bg-(--island-bg-color) shadow-(--shadow-island)"
            >
              <Search
                className="ml-3.5 h-4 w-4 shrink-0 text-(--keybinding-color)"
                aria-hidden="true"
              />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                onKeyDown={onInputKeyDown}
                placeholder={placeholder}
                aria-label={label}
                className="h-full min-w-0 flex-1 bg-transparent px-1.5 text-[0.8125rem] text-(--text-primary-color) outline-none placeholder:text-(--keybinding-color)"
              />
              {trailing}
              <motion.button
                type="button"
                onClick={onCollapse}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                title="Close search"
                aria-label="Close search"
                className="mr-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-(--icon-fill-color) hover:bg-(--button-hover-bg) focus-visible:shadow-[0_0_0_2px_var(--focus-highlight-color)] focus-visible:outline-none"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </motion.button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}
