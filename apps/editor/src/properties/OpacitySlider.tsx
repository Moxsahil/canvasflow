interface OpacitySliderProps {
  value: number;
  onChange: (value: number) => void;
}

/** 0–100 range with its bounds labelled beneath, as in the reference UI. */
export function OpacitySlider({ value, onChange }: OpacitySliderProps) {
  return (
    <div className="cf-opacity">
      <input
        className="cf-opacity__range"
        type="range"
        min={0}
        max={100}
        step={10}
        value={value}
        aria-label="Opacity"
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <div className="cf-opacity__bounds" aria-hidden="true">
        <span>0</span>
        <span>100</span>
      </div>
    </div>
  );
}
