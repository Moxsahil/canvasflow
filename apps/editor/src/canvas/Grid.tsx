import { useId } from 'react';
import type { Camera } from '../machine/tool-machine.types';
import { gridLevels } from './grid';

interface GridProps {
  camera: Camera;
}

/**
 * The dotted grid behind the board.
 *
 * SVG patterns rather than dots painted onto a canvas: the browser tiles a
 * pattern itself, so panning and zooming a grid that covers the viewport costs
 * one attribute change instead of a loop over every dot on screen — and the
 * count grows as you zoom out, which is exactly when frames are scarcest.
 */
export function Grid({ camera }: GridProps) {
  // React's generated ids contain colons, which `url(#…)` will not resolve.
  const id = useId().replace(/:/g, '_');
  const levels = gridLevels(camera);

  return (
    <svg className="cf-grid" aria-hidden="true">
      <defs>
        {levels.map((level) => (
          <pattern
            key={level.step}
            id={`${id}_${level.step}`}
            width={level.spacing}
            height={level.spacing}
            patternUnits="userSpaceOnUse"
          >
            <circle
              className="cf-grid-dot"
              cx={level.offsetX}
              cy={level.offsetY}
              r={1}
              opacity={level.opacity}
            />
          </pattern>
        ))}
      </defs>
      {levels.map((level) => (
        <rect key={level.step} width="100%" height="100%" fill={`url(#${id}_${level.step})`} />
      ))}
    </svg>
  );
}
