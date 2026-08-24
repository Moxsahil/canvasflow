import { GlassDockGroup, GlassDockItem } from '@/components/ui/glass-dock';
import { TOOLS, type Tool } from '../tools/tool';
import { ToolButton } from './ToolButton';

const TOOL_GROUP = 'cf-active-tool';

interface ToolbarProps {
  activeTool: Tool;
  onToolChange: (tool: Tool) => void;
  /** Viewers keep only the tools that move the view, not the drawing. */
  readOnly?: boolean;
}

/**
 * Tools that change nothing about the document, and so remain available to a
 * viewer: they still need to select things to read them, and to pan around.
 */
const VIEW_ONLY_TOOLS = new Set<Tool>(['select', 'hand']);

export function Toolbar({ activeTool, onToolChange, readOnly = false }: ToolbarProps) {
  // Filtered rather than disabled: a row of dead buttons invites clicking, and
  // the document refuses their edits anyway (see BoardDocument.setReadOnly).
  const tools = readOnly ? TOOLS.filter((meta) => VIEW_ONLY_TOOLS.has(meta.id)) : TOOLS;

  return (
    <GlassDockGroup role="radiogroup" aria-label="Drawing tools">
      {tools.map((meta) => (
        <GlassDockItem
          key={meta.id}
          id={`tool-${meta.id}`}
          // The dock's own tooltip carries the shortcut, so ToolButton no
          // longer sets `title` — two tooltips would stack on one button.
          label={`${meta.label} · ${meta.shortcut}`}
        >
          <ToolButton
            meta={meta}
            active={activeTool === meta.id}
            group={TOOL_GROUP}
            onSelect={onToolChange}
          />
        </GlassDockItem>
      ))}
    </GlassDockGroup>
  );
}
