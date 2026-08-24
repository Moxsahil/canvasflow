import type { ToolMeta } from '../tools/tool';
import type { Tool } from '../tools/tool';
import './ToolButton.css';

interface ToolButtonProps {
  meta: ToolMeta;
  active: boolean;
  /** Radio group name — shared by every button in one toolbar. */
  group: string;
  onSelect: (tool: Tool) => void;
}

/**
 * A tool button is a visually hidden `<input type="radio">` inside a label.
 * Using a real radio group (rather than buttons with aria-pressed) gets roving
 * arrow-key navigation and correct single-choice semantics from the browser,
 * and lets the selected style be pure CSS via `:checked +`.
 */
export function ToolButton({ meta, active, group, onSelect }: ToolButtonProps) {
  const { id, label, icon: Icon, shortcut, numericKey } = meta;
  const shortcutHint = numericKey ? `${shortcut} or ${numericKey}` : shortcut;

  return (
    <label className="cf-tool-button">
      <input
        className="cf-tool-button__input"
        type="radio"
        name={group}
        checked={active}
        onChange={() => onSelect(id)}
        aria-label={label}
        aria-keyshortcuts={shortcutHint}
        data-testid={`toolbar-${id}`}
      />
      <span className="cf-tool-button__icon" aria-hidden="true">
        <Icon />
        {numericKey && <span className="cf-tool-button__keybinding">{numericKey}</span>}
      </span>
    </label>
  );
}
