import { useMemo, useState } from 'react';
import { GlassDockGroup, GlassDockItem } from '@/components/ui/glass-dock';
import { TOOLS, type Tool } from '../tools/tool';
import { ToolButton } from './ToolButton';
import { ToolOverflow } from './ToolOverflow';

const TOOL_GROUP = 'cf-active-tool';

interface ToolbarProps {
  activeTool: Tool;
  onToolChange: (tool: Tool) => void;
  /** Viewers keep only the tools that move the view, not the drawing. */
  readOnly?: boolean;
  /** Where the overflow list portals. Outside `.cf-editor` its tokens are empty. */
  portalContainer?: HTMLElement | null;
}

/**
 * Tools that change nothing about the document, and so remain available to a
 * viewer: they still need to select things to read them, and to pan around.
 *
 * The laser qualifies for exactly the same reason — its trail is presence, not
 * document — and it is the one tool a viewer most needs during a live review,
 * where the whole point is asking about a part of the board out loud.
 */
const VIEW_ONLY_TOOLS = new Set<Tool>(['select', 'hand', 'laser']);

export function Toolbar({
  activeTool,
  onToolChange,
  readOnly = false,
  portalContainer = null,
}: ToolbarProps) {
  const [overflowOpen, setOverflowOpen] = useState(false);

  // Filtered rather than disabled: a row of dead buttons invites clicking, and
  // the document refuses their edits anyway (see BoardDocument.setReadOnly).
  const tools = useMemo(
    () => (readOnly ? TOOLS.filter((meta) => VIEW_ONLY_TOOLS.has(meta.id)) : TOOLS),
    [readOnly],
  );

  const rowTools = useMemo(() => tools.filter((meta) => !meta.overflow), [tools]);
  const overflowTools = useMemo(() => tools.filter((meta) => meta.overflow), [tools]);

  return (
    <GlassDockGroup role="radiogroup" aria-label="Drawing tools">
      {rowTools.map((meta) => (
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

      {/* Last, and only when it holds something: in read-only mode the laser
          is the sole overflow tool left, and one item behind a chevron is
          worse than one more button in the row. */}
      {overflowTools.length > 1 && (
        <ToolOverflow
          tools={overflowTools}
          activeTool={activeTool}
          onToolChange={onToolChange}
          open={overflowOpen}
          onOpenChange={setOverflowOpen}
          container={portalContainer}
        />
      )}
      {overflowTools.length === 1 &&
        overflowTools.map((meta) => (
          <GlassDockItem
            key={meta.id}
            id={`tool-${meta.id}`}
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
