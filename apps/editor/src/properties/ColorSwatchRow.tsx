import { cn } from '@canvasflow/ui';

interface ColorSwatchRowProps<T extends string | null> {
  swatches: ReadonlyArray<{ readonly value: T; readonly label: string }>;
  value: T;
  onChange: (value: T) => void;
  /** Opens the picker; receives the trigger so the popover can align to it. */
  onOpenPicker: (trigger: HTMLElement) => void;
  pickerOpen: boolean;
}

/**
 * Five quick-pick colours, a divider, then the value currently in effect. That
 * last swatch doubles as the trigger for the full picker, which is where any
 * colour outside the five comes from.
 */
export function ColorSwatchRow<T extends string | null>({
  swatches,
  value,
  onChange,
  onOpenPicker,
  pickerOpen,
}: ColorSwatchRowProps<T>) {
  return (
    <>
      {swatches.map(({ value: swatchValue, label }) => (
        <button
          key={label}
          type="button"
          className={cn(
            'cf-swatch',
            swatchValue === null && 'cf-swatch--transparent',
            swatchValue === value && 'cf-swatch--active',
          )}
          style={swatchValue === null ? undefined : { backgroundColor: swatchValue }}
          title={label}
          aria-label={label}
          aria-pressed={swatchValue === value}
          onClick={() => onChange(swatchValue)}
        />
      ))}
      <span className="cf-swatch-row__divider" aria-hidden="true" />
      <button
        type="button"
        className={cn(
          'cf-swatch',
          'cf-swatch--trigger',
          value === null && 'cf-swatch--transparent',
          pickerOpen && 'cf-swatch--active',
        )}
        style={value === null ? undefined : { backgroundColor: value }}
        title="Choose a colour"
        aria-label={`Choose a colour — currently ${value ?? 'transparent'}`}
        aria-haspopup="dialog"
        aria-expanded={pickerOpen}
        onClick={(e) => onOpenPicker(e.currentTarget)}
      />
    </>
  );
}
