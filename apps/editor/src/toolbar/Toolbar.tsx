import { TOOLS, type Tool } from '../tools/tool';
import { Island, Stack } from '../ui';
import { ToolButton } from './ToolButton';
import './Toolbar.css';

const TOOL_GROUP = 'cf-active-tool';

interface ToolbarProps {
  activeTool: Tool;
  onToolChange: (tool: Tool) => void;
}

export function Toolbar({ activeTool, onToolChange }: ToolbarProps) {
  return (
    <div className="cf-toolbar-container" role="radiogroup" aria-label="Drawing tools">
      <Island padding={1}>
        <Stack.Row gap={1} align="center">
          {TOOLS.map((meta) => (
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
