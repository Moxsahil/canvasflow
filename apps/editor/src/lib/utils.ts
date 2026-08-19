/**
 * `@/lib/utils` is where shadcn-generated components expect to find `cn`, so
 * this re-export lets components copied from shadcn land in
 * `src/components/ui/` unmodified. The implementation itself (clsx +
 * tailwind-merge) lives in the design system.
 */
export { cn } from '@canvasflow/ui';
