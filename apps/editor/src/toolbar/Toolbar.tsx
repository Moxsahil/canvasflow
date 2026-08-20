import { TOOLS, type Tool } from '../tools/tool';
import { Island, Stack } from '../ui';
import { ToolButton } from './ToolButton';
import './Toolbar.css';

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
    <div className="cf-toolbar-container" role="radiogroup" aria-label="Drawing tools">
      <Island padding={1}>
        <Stack.Row gap={1} align="center">
          {tools.map((meta) => (
            <ToolButton
              key={meta.id}
              meta={meta}
              active={activeTool === meta.id}
              group={TOOL_GROUP}
              onSelect={onToolChange}
            />
          ))}
        </Stack.Row>
      </Island>
    </div>
  );
}
