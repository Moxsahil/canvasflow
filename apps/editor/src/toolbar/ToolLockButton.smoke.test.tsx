import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ToolLockButton } from './ToolLockButton';
import { TOOLS, isLockableTool, type Tool } from '../tools/tool';

const noop = () => {};

function render(activeTool: Tool, locked = false) {
  return renderToString(<ToolLockButton activeTool={activeTool} locked={locked} onToggle={noop} />);
}

describe('ToolLockButton', () => {
  it('shows for the tools the lock governs', () => {
    expect(render('rectangle')).toContain('<button');
    expect(render('text')).toContain('<button');
  });

  it('stays away on tools it could not affect', () => {
    // Nothing happens after the select or hand tool "finishes", and the pencil
    // and sketch tools are exempt outright — a padlock there would be a
    // control that does nothing to the tool you are looking at.
    for (const tool of ['select', 'hand', 'eraser', 'laser', 'freehand', 'sketch'] as Tool[]) {
      expect(render(tool)).toBe('');
    }
  });

  it('agrees with isLockableTool for every tool in the toolbar', () => {
    for (const meta of TOOLS) {
      expect(render(meta.id) !== '').toBe(isLockableTool(meta.id));
    }
  });

  it('says which way it is set, for the pointer and the screen reader alike', () => {
    expect(render('rectangle', true)).toContain('aria-pressed="true"');
    expect(render('rectangle', true)).toContain('Tool lock, on');
    expect(render('rectangle', false)).toContain('aria-pressed="false"');
    expect(render('rectangle', false)).toContain('Tool lock, off');
  });

  it('sits at the right edge of the dock column, above the bar', () => {
    expect(render('rectangle')).toContain('self-end');
  });
});
