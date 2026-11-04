import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { useT } from '../../i18n';
import type { SurfaceTheme } from '../../ui/surface-palette';
import { Icon } from './icons';
import { SlotsContext } from './shell';
import './phone-settings.css';

/** How far a drag on the grip has to pull the sheet down before letting go closes it. */
const DISMISS_DRAG = 110;

/**
 * A sheet that rises from the foot of a phone screen only as high as what it
 * holds — the board's Share, Rename and the workspaces — in the look of the
 * phone's Settings. Its pages stack: Back goes up one, the grip or × closes.
 */
export function ShortSheet({
  title,
  sub,
  theme,
  page,
  onBack,
  onClose,
  container,
  testId,
  children,
}: {
  title: string;
  sub?: string;
  theme: SurfaceTheme;
  /** Names the page on show, so moving to another slides it in. */
  page: string;
  /** Up one page; left out on the first. */
  onBack?: () => void;
  onClose: () => void;
  container?: HTMLElement | null;
  testId?: string;
  children: ReactNode;
}) {
  const t = useT();
  const [cta, setCta] = useState<HTMLElement | null>(null);
  const [layer, setLayer] = useState<HTMLElement | null>(null);
  const [drag, setDrag] = useState(0);
  const dragStart = useRef<number | null>(null);
  const firstPage = useRef(page);
  const slots = useMemo(() => ({ cta, layer, setTitle: () => {} }), [cta, layer]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (onBack) onBack();
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack, onClose]);

  const endDrag = () => {
    if (dragStart.current === null) return;
    dragStart.current = null;
    if (drag > DISMISS_DRAG) onClose();
    else setDrag(0);
  };

  return createPortal(
    <>
      <div className="cf-ps-scrim" onClick={onClose} aria-hidden="true" />
      <section
        className={cn('cf-ps short', theme === 'light' && 'light', drag ? 'dragging' : 'settle')}
        style={drag ? { transform: `translateY(${drag}px)` } : undefined}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid={testId}
      >
        <div
          className="st-top"
          onPointerDown={(event) => {
            if ((event.target as HTMLElement).closest('button')) return;
            dragStart.current = event.clientY;
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (dragStart.current === null) return;
            setDrag(Math.max(0, event.clientY - dragStart.current));
          }}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <div className="grab" />
          <div className="st-bar">
            {onBack ? (
              <button
                type="button"
                className="st-ib"
                onClick={onBack}
                aria-label={t('common.back')}
              >
                <Icon name="chevleft" size={19} />
              </button>
            ) : (
              <span />
            )}
            <span />
            <button
              type="button"
              className="st-ib r"
              onClick={onClose}
              aria-label={t('common.close')}
              data-testid={testId && `${testId}-close`}
            >
              <Icon name="x" size={16} />
            </button>
          </div>
        </div>
        <div
          key={page}
          className={cn(
            'st-body',
            page !== firstPage.current && (onBack ? 'push-in' : 'push-back'),
          )}
        >
          <h2 className="ms-h">{title}</h2>
          {sub ? <div className="ms-sub">{sub}</div> : <div style={{ height: 10 }} />}
          <SlotsContext.Provider value={slots}>{children}</SlotsContext.Provider>
        </div>
        <div className="st-cta" ref={setCta} />
        <div ref={setLayer} />
      </section>
    </>,
    // Inside the editor where it can be, which carries the accent colour.
    container ?? document.querySelector<HTMLElement>('.cf-editor') ?? document.body,
  );
}
