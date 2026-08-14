import { useEffect, useRef, useState } from 'react';
import { ColorWheel } from './ColorWheel';
import { hexToHsv, hsvToHex, parseHex, rgbToHex, type Hsv } from './hsv';

const FALLBACK_HSV: Hsv = { h: 0, s: 0, v: 0.12 };

interface ColorPickerPopoverProps {
  title: string;
  value: string | null;
  /** Background accepts "no fill"; stroke does not. */
  allowTransparent: boolean;
  /** Offset from the top of the panel container, aligned to the trigger. */
  top: number;
  /** Clicks here don't count as clicking away — the trigger toggles instead. */
  trigger: HTMLElement;
  onChange: (value: string | null, transient: boolean) => void;
  onClose: () => void;
}

/**
 * Colour picker anchored beside the properties panel.
 *
 * Rendered as a sibling of the panel Island rather than inside it: the Island
 * scrolls, and a popover within it would be clipped at the panel edge.
 */
export function ColorPickerPopover({
  title,
  value,
  allowTransparent,
  top,
  trigger,
  onChange,
  onClose,
}: ColorPickerPopoverProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [hsv, setHsv] = useState<Hsv>(() =>
    value ? (hexToHsv(value) ?? FALLBACK_HSV) : FALLBACK_HSV,
  );
  const [hexDraft, setHexDraft] = useState(value ?? '');

  // Follow the value when it changes from outside (a swatch click, a different
  // shape being selected) without fighting the user mid-drag.
  useEffect(() => {
    setHexDraft(value ?? '');
    if (value) {
      const next = hexToHsv(value);
      if (next) setHsv(next);
    }
  }, [value]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      const root = rootRef.current;
      const target = event.target as Node;
      if (!root || root.contains(target)) return;
      // Leave the trigger alone, or it would close here and immediately
      // reopen on its own click handler instead of toggling shut.
      if (trigger.contains(target)) return;
      onClose();
    };
    // Capture phase: the canvas suppresses default pointer handling, so a click
    // on it would otherwise never reach a bubbling listener.
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [onClose, trigger]);

  const applyHsv = (next: Hsv, transient: boolean) => {
    setHsv(next);
    const hex = hsvToHex(next);
    setHexDraft(hex);
    onChange(hex, transient);
  };

  const commitHexDraft = () => {
    const rgb = parseHex(hexDraft);
    if (!rgb) {
      setHexDraft(value ?? '');
      return;
    }
    const hex = rgbToHex(rgb);
    setHexDraft(hex);
    onChange(hex, false);
  };

  return (
    <div
      ref={rootRef}
      className="cf-color-popover"
      style={{ top }}
      role="dialog"
      aria-label={title}
    >
      <ColorWheel value={hsv} onChange={applyHsv} />

      <label className="cf-color-popover__field">
        <span className="cf-properties__label">Brightness</span>
        <input
          className="cf-color-popover__value"
          type="range"
          min={0}
          max={100}
          value={Math.round(hsv.v * 100)}
          aria-label="Brightness"
          style={{
            // Track previews the current hue at full saturation.
            backgroundImage: `linear-gradient(to right, #000, ${hsvToHex({ h: hsv.h, s: hsv.s, v: 1 })})`,
          }}
          onChange={(e) => applyHsv({ ...hsv, v: Number(e.target.value) / 100 }, true)}
          onPointerUp={() => onChange(hsvToHex(hsv), false)}
          onKeyUp={() => onChange(hsvToHex(hsv), false)}
        />
      </label>

      <label className="cf-color-popover__field">
        <span className="cf-properties__label">Hex code</span>
        <span className="cf-color-popover__hex">
          <span aria-hidden="true">#</span>
          <input
            value={hexDraft.replace(/^#/, '')}
            spellCheck={false}
            aria-label="Hex code"
            onChange={(e) => setHexDraft(e.target.value)}
            onBlur={commitHexDraft}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') commitHexDraft();
            }}
          />
        </span>
      </label>

      {allowTransparent && (
        <button
          type="button"
          className="cf-color-popover__transparent"
          onClick={() => {
            onChange(null, false);
            onClose();
          }}
        >
          Transparent
        </button>
      )}
    </div>
  );
}
