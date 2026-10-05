import { useMemo } from 'react';
import { Crosshair, Link as LinkIcon } from 'lucide-react';
import type { Shape } from '@canvasflow/canvas-engine';
import { menuSurfaceClasses } from '@/components/ui/menu-look';
import { cn } from '@/lib/utils';
import type { Camera } from '../machine/tool-machine.types';
import type { Size } from '../properties/halo-placement';
import {
  LINK_BADGE_SIZE,
  currentHref,
  currentOrigin,
  linkBadgePlacements,
  linkTarget,
} from './link-placement';
import { describeLink, followLinkClick } from './shape-link';

interface LinkBadgesProps {
  shapes: readonly Shape[];
  camera: Camera;
  board: Size;
  /** The shape whose link box is up, which says the same thing in full. */
  except: string | null;
  /** Offered a plain click first; takes it for a place on this board. */
  onFollow?: (link: string) => boolean;
}

/**
 * A badge on the corner of every linked shape on screen, which opens the link.
 *
 * Real links rather than buttons, so they behave as links do everywhere
 * else: a middle click opens a background tab, a right click offers to copy
 * the address, and hovering shows where it goes. Drawn over the canvas
 * rather than on it for the same reason, and so a press on one never reaches
 * the board to select or drag the shape beneath.
 */
export function LinkBadges({ shapes, camera, board, except, onFollow }: LinkBadgesProps) {
  const badges = useMemo(
    () => linkBadgePlacements(shapes, camera, board, except),
    [shapes, camera, board, except],
  );
  if (badges.length === 0) return null;

  const origin = currentOrigin();
  const here = currentHref();
  return (
    <div
      className="pointer-events-none absolute inset-0 z-(--zIndex-wysiwyg) overflow-hidden"
      data-testid="link-badges"
    >
      {badges.map(({ id, link, left, top }) => {
        const { label, onThisBoard } = describeLink(link, here);
        // A place on this board moves the view rather than leaving, so it
        // says so, and is drawn as somewhere to go rather than a page.
        const Icon = onThisBoard ? Crosshair : LinkIcon;
        return (
          <a
            key={id}
            href={link}
            target={linkTarget(link, origin)}
            rel="noopener noreferrer"
            draggable={false}
            title={label}
            aria-label={onThisBoard ? `Go to ${label}` : `Open link: ${label}`}
            data-testid="link-badge"
            className={cn(
              menuSurfaceClasses,
              'pointer-events-auto absolute flex items-center justify-center rounded-md shadow-[0_1px_2px_rgb(0_0_0/0.18)] outline-none hover:bg-neutral-200 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--focus-highlight-color) dark:hover:bg-neutral-700',
            )}
            style={{ left, top, width: LINK_BADGE_SIZE, height: LINK_BADGE_SIZE }}
            onClick={(event) => followLinkClick(event, link, onFollow)}
          >
            <Icon aria-hidden="true" className="size-3.5" />
          </a>
        );
      })}
    </div>
  );
}
