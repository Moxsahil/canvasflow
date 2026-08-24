/**
 * `@/lib/utils` is where the copied components expect to find `cn`, so this
 * re-export lets the files in `src/components/ui/` stay identical to the ones
 * in the editor. The implementation (clsx + tailwind-merge) is in the design
 * system.
 */
export { cn } from '@canvasflow/ui';
