import { useEffect, useState } from 'react';

/**
 * Track device pixel ratio reactively.
 *
 * DPR can change at runtime when the user drags the window between
 * monitors of different DPI. We listen for that and re-render so the
 * canvas resharpens.
 */
export function useDevicePixelRatio(): number {
  const [dpr, setDpr] = useState(() =>
    typeof window === 'undefined' ? 1 : window.devicePixelRatio,
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia(`(resolution: ${dpr}dppx)`);
    const handleChange = () => setDpr(window.devicePixelRatio);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [dpr]);

  return dpr;
}
