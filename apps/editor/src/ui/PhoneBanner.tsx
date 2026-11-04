import { useEffect } from 'react';
import { Icon } from '../settings/phone/icons';
import '../settings/phone/phone-settings.css';

/** How long a banner with something to do stays up. */
const BANNER_MS = 4200;

export interface PhoneBannerMessage {
  /** Changes with every banner, so the same words twice start afresh. */
  id: number;
  text: string;
  /** A follow-up a tap away: Undo after a reset, Live collaboration after a copy. */
  action?: { label: string; run: () => void };
}

/**
 * A phone's word that something worked, at the top of the screen with a tick
 * and, where there is one, the obvious next step beside it. Goes by itself.
 */
export function PhoneBanner({
  banner,
  onDone,
}: {
  banner: PhoneBannerMessage | null;
  onDone: () => void;
}) {
  useEffect(() => {
    if (!banner) return;
    const timer = setTimeout(onDone, BANNER_MS);
    return () => clearTimeout(timer);
  }, [banner, onDone]);

  if (!banner) return null;
  return (
    <div key={banner.id} className="cf-phone-banner" role="status" data-testid="phone-banner">
      <span className="tk">
        <Icon name="check" size={12} />
      </span>
      <span className="tx">{banner.text}</span>
      {banner.action && (
        <button
          type="button"
          onClick={() => {
            banner.action?.run();
            onDone();
          }}
        >
          {banner.action.label}
        </button>
      )}
    </div>
  );
}
