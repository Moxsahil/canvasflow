import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { GlassDock, GlassDockGroup, GlassDockItem } from '@/components/ui/glass-dock';
import { useIsMobile } from '@/hooks/use-mobile';
import { useT } from '../i18n';
import { TOOLS, VIEW_ONLY_TOOLS, type Tool, type ToolMeta } from '../tools/tool';
import { ToolButton } from './ToolButton';
import { ToolOverflow } from './ToolOverflow';

const TOOL_GROUP = 'cf-active-tool';

const PHONE_ROW_TOOLS: ReadonlySet<Tool> = new Set<Tool>([
  'select',
  'rectangle',
  'arrow',
  'freehand',
  'text',
  'eraser',
]);

/**
 * On a phone, tools that share one slot in the row: the first stands for the
 * rest, the slot shows whichever was picked last, and while one of them is in
 * use a tray above the toolbar holds them all, to switch between.
 */
export const PHONE_TOOL_FAMILIES: readonly (readonly Tool[])[] = [
  ['rectangle', 'diamond', 'ellipse'],
  ['arrow', 'line'],
];

/** The family a tool shares its phone slot with, or null for a tool on its own. */
export function phoneFamilyOf(tool: Tool): readonly Tool[] | null {
  return PHONE_TOOL_FAMILIES.find((family) => family.includes(tool)) ?? null;
}

/** Tools reached through their family's slot and tray rather than on their own. */
const IN_A_FAMILY: ReadonlySet<Tool> = new Set(
  PHONE_TOOL_FAMILIES.flatMap((family) => family.slice(1)),
);

/**
 * On a phone, the order tools earn a place in the row: the ones a finger
 * reaches for most first. Whatever the screen cannot fit waits in the list.
 */
const PHONE_PRIORITY: readonly Tool[] = [
  'select',
  'hand',
  'freehand',
  'eraser',
  'rectangle',
  'arrow',
  'text',
  'note',
  'ellipse',
  'diamond',
  'line',
  'image',
  'frame',
  'comment',
  'mindmap',
  'laser',
  'sketch',
  'bucket',
  'embed',
];

/**
 * One tool's share of a phone's row: the button, 40px there for a finger
 * (see `.cf-editor[data-phone]` in global.css), and the gap after it.
 */
const TOOL_PITCH = 44;
/** The dock's own padding and border, around the buttons. */
const DOCK_FRAME = 14;
const TOOL_GAP = 4;

/**
 * The tools a phone's row holds, in the order they are shown.
 *
 * As many as `fitWidth` allows, keeping one slot for the overflow's chevron
 * when anything is left over. The tool picked last from the overflow takes
 * the row's final slot, so switching back to it is one tap, not two.
 */
export function phoneRowTools(
  tools: readonly Tool[],
  fitWidth: number,
  recent: Tool | null,
): Tool[] {
  const ordered = PHONE_PRIORITY.filter((id) => tools.includes(id) && !IN_A_FAMILY.has(id));
  const slots = Math.floor((fitWidth - DOCK_FRAME + TOOL_GAP) / TOOL_PITCH);
  if (slots >= ordered.length) return ordered;
  const count = Math.max(4, slots - 1);
  const row = ordered.slice(0, count);
  if (recent && ordered.includes(recent) && !row.includes(recent)) row[count - 1] = recent;
  return row;
}

interface ToolbarProps {
  activeTool: Tool;
  onToolChange: (tool: Tool) => void;
  /** Viewers keep only the tools that move the view, not the drawing. */
  readOnly?: boolean;
  /** Where the overflow list portals. Outside `.cf-editor` its tokens are empty. */
  portalContainer?: HTMLElement | null;
  /**
   * On a phone, the width the toolbar may take, in CSS pixels: the row then
   * holds as many tools as fit, in {@link PHONE_PRIORITY} order. Left out
   * everywhere else, where the row is the one it has always been.
   */
  phoneFitWidth?: number;
}

export function Toolbar({
  activeTool,
  onToolChange,
  readOnly = false,
  portalContainer = null,
  phoneFitWidth,
}: ToolbarProps) {
  const t = useT();
  const [overflowOpen, setOverflowOpen] = useState(false);

  // Filtered rather than disabled: a row of dead buttons invites clicking, and
  // the document refuses their edits anyway (see BoardDocument.setReadOnly).
  const tools = useMemo(
    () => (readOnly ? TOOLS.filter((meta) => VIEW_ONLY_TOOLS.has(meta.id)) : TOOLS),
    [readOnly],
  );

  // A narrow window holds the everyday tools; the rest wait in the list, so the
  // row is never cut off at the screen's edges.
  const isPhone = useIsMobile();
  const inRow = useCallback(
    (meta: (typeof TOOLS)[number]) =>
      isPhone && !readOnly ? PHONE_ROW_TOOLS.has(meta.id) : !meta.overflow,
    [isPhone, readOnly],
  );

  // On a phone layout the row is measured instead: as many as the screen
  // holds, with the tool last picked from the list kept in the final slot.
  const toolIds = useMemo(() => tools.map((meta) => meta.id), [tools]);
  const [recent, setRecent] = useState<Tool | null>(null);
  const fitted = useMemo(
    () => (phoneFitWidth === undefined ? null : phoneRowTools(toolIds, phoneFitWidth, recent)),
    [phoneFitWidth, toolIds, recent],
  );
  useEffect(() => {
    if (
      fitted &&
      !fitted.includes(activeTool) &&
      !IN_A_FAMILY.has(activeTool) &&
      toolIds.includes(activeTool)
    ) {
      setRecent(activeTool);
    }
  }, [activeTool, fitted, toolIds]);

  const rowTools = useMemo(
    () =>
      fitted ? fitted.flatMap((id) => tools.filter((meta) => meta.id === id)) : tools.filter(inRow),
    [fitted, tools, inRow],
  );
  const overflowTools = useMemo(
    () =>
      tools.filter(
        (meta) => !rowTools.includes(meta) && !(fitted !== null && IN_A_FAMILY.has(meta.id)),
      ),
    [tools, rowTools, fitted],
  );

  // A family's slot shows the member last used, the one its button picks.
  const [picks, setPicks] = useState<Partial<Record<Tool, Tool>>>({});
  useEffect(() => {
    const family = phoneFamilyOf(activeTool);
    const leader = family?.[0];
    if (!leader) return;
    setPicks((was) => (was[leader] === activeTool ? was : { ...was, [leader]: activeTool }));
  }, [activeTool]);
  const slotMeta = (meta: ToolMeta): ToolMeta => {
    if (!fitted) return meta;
    const family = phoneFamilyOf(meta.id);
    if (!family) return meta;
    const shown = family.includes(activeTool) ? activeTool : (picks[meta.id] ?? meta.id);
    return TOOLS.find((candidate) => candidate.id === shown) ?? meta;
  };

  return (
    <GlassDockGroup
      role="radiogroup"
      aria-label={t('toolbar.drawingTools')}
      // On a phone the row spans the screen, edge to edge with the actions
      // row above it, its tools spread evenly across.
      style={phoneFitWidth === undefined ? undefined : { flex: 1, justifyContent: 'space-between' }}
    >
      {rowTools.map((slot) => {
        const meta = slotMeta(slot);
        return (
          <GlassDockItem
            key={slot.id}
            id={`tool-${slot.id}`}
            // The dock's own tooltip carries the shortcut, so ToolButton no
            // longer sets `title` — two tooltips would stack on one button.
            label={`${t(meta.labelKey)} · ${meta.shortcut}`}
          >
            <ToolButton
              meta={meta}
              active={activeTool === meta.id}
              group={TOOL_GROUP}
              onSelect={onToolChange}
            />
          </GlassDockItem>
        );
      })}

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
            label={`${t(meta.labelKey)} · ${meta.shortcut}`}
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

/**
 * The tray over a phone's toolbar while a tool from a family is in use: the
 * family's tools side by side, centred over the slot they share, to switch
 * between without going back to the row.
 */
export function PhoneToolTray({
  activeTool,
  onToolChange,
}: {
  activeTool: Tool;
  onToolChange: (tool: Tool) => void;
}) {
  const t = useT();
  const family = phoneFamilyOf(activeTool);
  const rowRef = useRef<HTMLDivElement>(null);
  const trayRef = useRef<HTMLDivElement>(null);
  const [left, setLeft] = useState<number | null>(null);

  // Over the slot in the toolbar below, kept within the row's width.
  useLayoutEffect(() => {
    const row = rowRef.current;
    const tray = trayRef.current;
    if (!family || !row || !tray) return;
    const place = () => {
      // The toolbar's own button, not this tray's one for the same tool.
      const slot = [
        ...(row.parentElement?.querySelectorAll(`[data-testid="toolbar-${activeTool}"]`) ?? []),
      ]
        .find((input) => !row.contains(input))
        ?.closest('label');
      if (!slot) return;
      const bounds = row.getBoundingClientRect();
      const button = slot.getBoundingClientRect();
      const centre = button.left + button.width / 2 - bounds.left;
      const next = Math.max(
        0,
        Math.min(bounds.width - tray.offsetWidth, centre - tray.offsetWidth / 2),
      );
      setLeft((was) => (was === next ? was : next));
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(row);
    return () => observer.disconnect();
  }, [family, activeTool]);

  if (!family) return null;
  const members = family.flatMap((id) => TOOLS.filter((meta) => meta.id === id));

  return (
    <div ref={rowRef} className="flex" data-testid="phone-tool-tray">
      <div
        ref={trayRef}
        style={{ marginLeft: left ?? 0, visibility: left === null ? 'hidden' : undefined }}
      >
        <GlassDock aria-label={t('toolbar.drawingTools')}>
          <GlassDockGroup role="radiogroup" aria-label={t('toolbar.drawingTools')}>
            {members.map((meta) => (
              <GlassDockItem
                key={meta.id}
                id={`tray-${meta.id}`}
                label={`${t(meta.labelKey)} · ${meta.shortcut}`}
              >
                <ToolButton
                  meta={meta}
                  active={activeTool === meta.id}
                  group={`${TOOL_GROUP}-tray`}
                  onSelect={onToolChange}
                />
              </GlassDockItem>
            ))}
          </GlassDockGroup>
        </GlassDock>
      </div>
    </div>
  );
}
