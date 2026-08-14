import type { ReactNode } from 'react';
import { Stack } from '../ui';

interface PanelSectionProps {
  label: string;
  /**
   * `row` packs controls side by side, `grid` wraps them onto further rows once
   * they outgrow the panel, `block` gives them the full width.
   */
  layout?: 'row' | 'grid' | 'block';
  children: ReactNode;
}

/**
 * One labelled row of the properties panel. The label is a real `<legend>` so
 * the controls beneath it are announced as a named group.
 */
export function PanelSection({ label, layout = 'row', children }: PanelSectionProps) {
  return (
    <fieldset className="cf-panel-section">
      <legend className="cf-properties__label">{label}</legend>
      {layout === 'row' && (
        <Stack.Row gap={1} align="center">
          {children}
        </Stack.Row>
      )}
      {layout === 'grid' && <div className="cf-option-grid">{children}</div>}
      {layout === 'block' && children}
    </fieldset>
  );
}
