import { useEffect, useMemo, useRef } from 'react';
import type { Tool } from '../tools/tool';
import { COMMANDS, type CommandContext, type CommandId, type CommandMeta } from './commands';

const TOOL_PREFIX = 'tool:';

/** Every command that isn't a tool switch, each of which needs its own handler. */
type ActionCommandId = Exclude<CommandId, `${typeof TOOL_PREFIX}${Tool}`>;

/**
 * What the editor has to supply for the palette to be able to run anything.
 *
 * Spelled as a total record on purpose: adding a command to the registry
 * without wiring it up here is a type error rather than a row that does
 * nothing when you press Enter on it.
 */
export type CommandHandlers = Record<ActionCommandId, () => void> & {
  /** All fourteen tool commands come through here, carrying which one. */
  selectTool: (tool: Tool) => void;
};

export interface EditorCommand extends CommandMeta {
  readonly perform: () => void;
}

function toolOf(id: CommandId): Tool | null {
  return id.startsWith(TOOL_PREFIX) ? (id.slice(TOOL_PREFIX.length) as Tool) : null;
}

/**
 * The registry bound to the editor's own handlers, filtered to what applies
 * right now.
 *
 * The handlers are reached through a ref rather than closed over, because
 * nearly all of them are rebuilt whenever the selection or the camera moves.
 * Closing over them directly would rebuild all forty commands on every pointer
 * move; going through the ref means the list only changes when the answer to
 * "which commands apply" changes.
 */
export function useEditorCommands(
  handlers: CommandHandlers,
  context: CommandContext,
): EditorCommand[] {
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  const { readOnly, selectionCount, shapeCount, canUndo, canRedo, canRename } = context;

  // Rebuilt from the fields rather than the object, so the editor can pass a
  // literal without defeating the memo on every render.
  return useMemo(() => {
    const current: CommandContext = {
      readOnly,
      selectionCount,
      shapeCount,
      canUndo,
      canRedo,
      canRename,
    };

    const commands: EditorCommand[] = [];
    for (const meta of COMMANDS) {
      if (meta.available && !meta.available(current)) continue;

      const tool = toolOf(meta.id);
      commands.push({
        ...meta,
        perform: tool
          ? () => handlersRef.current.selectTool(tool)
          : () => handlersRef.current[meta.id as ActionCommandId](),
      });
    }
    return commands;
  }, [readOnly, selectionCount, shapeCount, canUndo, canRedo, canRename]);
}
