import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { menuLabelClasses, menuSeparatorClasses } from '@/components/ui/menu-look';
import { InspectorPopover, keepSliderKeys, PickerCell, Swatch } from '../inspector';
import { ColorWheel } from './ColorWheel';
import { hexToHsv, hsvToHex, parseHex, rgbToHex, type Hsv } from './hsv';

const FALLBACK_HSV: Hsv = { h: 0, s: 0, v: 0.12 };

interface ColorPickerPopoverProps {
  title: string;
  value: string | null;
  /** The quick picks. A `null` one is "no colour", which only fill offers. */
  swatches: ReadonlyArray<{ readonly value: string | null; readonly label: string }>;
  /** How the board paints a colour, when that differs from the stored one. */
  paint?: (value: string) => string;
  /** Where it sits within its containing block — see InspectorPopover. */
  position: CSSProperties;
  /** Controls that belong with the colour, shown under the quick picks. */
  extra?: ReactNode;
  /** Clicks here don't count as clicking away — the trigger toggles instead. */
  trigger: HTMLElement;
  onChange: (value: string | null, transient: boolean) => void;
  onClose: () => void;
}

/**
 * The colour a chip opens: the quick picks first, since most changes are one
 * of those, then the wheel, brightness and hex code for anything else.
 *
 * A quick pick closes the popover — it is a whole choice. The wheel keeps it
 * open, since it is adjusted rather than picked.
 */
export function ColorPickerPopover({
  title,
  value,
  swatches,
  paint = (colour) => colour,
  position,
  extra,
  trigger,
  onChange,
  onClose,
}: ColorPickerPopoverProps) {
  const [hsv, setHsv] = useState<Hsv>(() =>
    value ? (hexToHsv(value) ?? FALLBACK_HSV) : FALLBACK_HSV,
  );
  const [hexDraft, setHexDraft] = useState(value ?? '');

  // Follow the value when it changes from outside (a quick pick, a different
  // shape being selected) without fighting the user mid-drag.
  useEffect(() => {
    setHexDraft(value ?? '');
    if (value) {
      const next = hexToHsv(value);
      if (next) setHsv(next);
    }
  }, [value]);

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
    <InspectorPopover
      title={title}
      position={position}
      trigger={trigger}
      onClose={onClose}
      className="w-52 gap-2 p-1 pb-3"
    >
      <div
        className="grid gap-2 px-2 pt-1"
        style={{ gridTemplateColumns: `repeat(${swatches.length}, minmax(0, 1fr))` }}
      >
        {swatches.map((swatch) => (
          <PickerCell
            key={swatch.label}
            variant="colour"
            label={swatch.label}
            selected={swatch.value === value}
            className="h-6"
            onPick={() => {
              onChange(swatch.value, false);
              onClose();
            }}
          >
            <Swatch
              value={swatch.value}
              paint={swatch.value ? paint(swatch.value) : null}
              className="size-full rounded-[5px]"
            />
          </PickerCell>
        ))}
      </div>

      {extra}

      <div role="separator" className={cn(menuSeparatorClasses, 'my-1')} />

      <div className="flex flex-col gap-3 px-2">
        <ColorWheel value={hsv} onChange={applyHsv} />

        <label className="flex flex-col gap-1.5">
          <span className={cn(menuLabelClasses, 'p-0')}>Brightness</span>
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
            onKeyDown={keepSliderKeys}
            onKeyUp={() => onChange(hsvToHex(hsv), false)}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={cn(menuLabelClasses, 'p-0')}>Hex code</span>
          <span className="flex items-center gap-1 rounded-[5px] bg-neutral-950/5 px-2 py-1.5 font-mono text-xs dark:bg-neutral-50/5">
            <span aria-hidden="true" className="text-neutral-500 dark:text-neutral-400">
              #
            </span>
            <input
              value={hexDraft.replace(/^#/, '')}
              spellCheck={false}
              aria-label="Hex code"
              className="w-full border-0 bg-transparent p-0 font-mono text-xs uppercase outline-none"
              onChange={(e) => setHexDraft(e.target.value)}
              onBlur={commitHexDraft}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') commitHexDraft();
              }}
            />
          </span>
        </label>
      </div>
    </InspectorPopover>
  );
}
