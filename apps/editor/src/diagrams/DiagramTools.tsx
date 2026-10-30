import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import {
  Check,
  ChevronDown,
  Code,
  Database,
  FileCode,
  Network,
  Settings2,
  Waypoints,
  Workflow,
  X,
  type LucideIcon,
} from 'lucide-react';
import { DIAGRAM_DETAILED_COST } from '@canvasflow/types';
import { MenuGlide } from '@/components/ui/menu-look';
import { cn } from '@/lib/utils';
import { useT, type WordKey } from '../i18n';

export type DiagramToolId = 'detailed' | 'mindmap';

interface DiagramTool {
  id: DiagramToolId;
  icon: LucideIcon;
  /**
   * The tool's own colour, for its icon only. Muted, low in chroma, so a set
   * of them reads as one family rather than a rainbow, and mid in lightness,
   * so each reads at 3:1 or better on the light panel and the dark one.
   */
  color: string;
  label: WordKey;
  /** One line under the name in the list. */
  row: WordKey;
  /** What the info bar says while the tool is picked. */
  hint: WordKey;
  /** How many of the month's diagrams one run uses. */
  cost: number;
}

/**
 * What can be picked on top of a plain request. With none picked a diagram is
 * drawn quick; each tool here is something the gateway really does.
 */
export const DIAGRAM_TOOLS: readonly DiagramTool[] = [
  {
    id: 'detailed',
    icon: Network,
    color: '#5b7fc7',
    label: 'diagrams.detailed',
    row: 'diagrams.detailedRow',
    hint: 'diagrams.detailedHint',
    cost: DIAGRAM_DETAILED_COST,
  },
  {
    id: 'mindmap',
    icon: Waypoints,
    color: '#8a74c4',
    label: 'diagrams.toolMindmap',
    row: 'diagrams.toolMindmapRow',
    hint: 'diagrams.mindmapHint',
    cost: 1,
  },
];

/** A tool on its way: listed so people know it is coming, not yet to be picked. */
export interface SoonTool {
  id: string;
  icon: LucideIcon;
  /** As a tool's: for its icon only. */
  color: string;
  label: WordKey;
  row: WordKey;
}

export const DIAGRAM_TOOLS_SOON: readonly SoonTool[] = [
  {
    id: 'flowchart',
    icon: Workflow,
    color: '#4f9a7a',
    label: 'diagrams.toolFlowchart',
    row: 'diagrams.toolFlowchartRow',
  },
  {
    id: 'er',
    icon: Database,
    color: '#b08440',
    label: 'diagrams.toolEr',
    row: 'diagrams.toolErRow',
  },
  {
    id: 'mermaid',
    icon: FileCode,
    color: '#bd6a84',
    label: 'diagrams.toolMermaid',
    row: 'diagrams.toolMermaidRow',
  },
  {
    id: 'code',
    icon: Code,
    color: '#4a96aa',
    label: 'diagrams.toolCode',
    row: 'diagrams.toolCodeRow',
  },
];

export const diagramTool = (id: DiagramToolId | null) =>
  DIAGRAM_TOOLS.find((tool) => tool.id === id);

const keys = DIAGRAM_TOOLS.length > 1 ? `1–${DIAGRAM_TOOLS.length}` : '1';

export const soonBadge =
  'shrink-0 rounded-full border border-[var(--surface-border)] px-1.5 py-px text-[10px] font-medium text-[var(--surface-fg-muted)]';

const kbd =
  'inline-grid h-4 min-w-4 place-items-center rounded border border-[var(--surface-border)] px-1 font-mono text-[10px] leading-none text-[var(--surface-fg-faint)]';

/** The strip over the box: what the picked tool does, or that none is picked. */
export function toolInfo(id: DiagramToolId | null, t: ReturnType<typeof useT>) {
  const tool = diagramTool(id);
  const Icon = tool?.icon ?? Settings2;
  return {
    icon: (
      <Icon
        className={cn(
          'size-3.5 shrink-0',
          tool ? 'text-[var(--surface-link)]' : 'text-[var(--surface-fg-faint)]',
        )}
        aria-hidden="true"
      />
    ),
    description: tool ? t(tool.hint, { cost: tool.cost }) : t('diagrams.noTool'),
  };
}

const STRIP_HIDDEN_KEY = 'cf:diagram-tool-strip-hidden';

/** Whether the strip over the box was closed, in this browser. */
export function toolStripHidden(): boolean {
  try {
    return localStorage.getItem(STRIP_HIDDEN_KEY) === '1';
  } catch {
    // Private windows and blocked storage: showing it is the harmless side.
    return false;
  }
}

export function hideToolStrip(): void {
  try {
    localStorage.setItem(STRIP_HIDDEN_KEY, '1');
  } catch {
    // Still hidden for this visit, just not remembered.
  }
}

/** The info bar's button, which opens the same list as the Tools pill. */
export function ToolsShortcut({
  picked,
  disabled,
  onOpen,
}: {
  picked: DiagramToolId | null;
  disabled: boolean;
  onOpen: () => void;
}) {
  const t = useT();
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onOpen}
      className="inline-flex h-6 items-center gap-1.5 rounded-md bg-[var(--surface-raised)] pr-1 pl-2 text-[11.5px] font-medium text-[var(--surface-fg)] outline-none hover:bg-[var(--surface-raised-hover)] focus-visible:ring-2 focus-visible:ring-[var(--surface-accent)] disabled:opacity-45"
    >
      {picked ? t('diagrams.changeTool') : t('diagrams.pickTool')}
      <kbd className={kbd}>/</kbd>
    </button>
  );
}

const toolRow =
  'relative flex h-10 cursor-default items-center gap-2.5 rounded-lg px-3 text-sm outline-none select-none';

/** A tool's icon in its own colour, on a round tint of it. */
function ToolTile({ icon: Icon, color }: { icon: LucideIcon; color: string }) {
  return (
    <span
      aria-hidden="true"
      className="grid size-6 shrink-0 place-items-center rounded-full"
      style={{ backgroundColor: `${color}26` }}
    >
      <Icon className="size-3.5" style={{ color }} />
    </span>
  );
}

/**
 * The Tools pill and its list. Picking a tool turns the pill into it, tinted,
 * with an × to take it off; picking it again takes it off too. While the list
 * is open, a tool's number picks it.
 */
export function DiagramTools({
  picked,
  onPick,
  open,
  onOpenChange,
  onClosed,
  left,
  disabled,
  container,
}: {
  picked: DiagramToolId | null;
  onPick: (id: DiagramToolId | null) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Focus goes back to the box rather than to the pill. */
  onClosed: () => void;
  /** Diagrams left this month; a tool that costs more is greyed out. */
  left: number | null;
  disabled: boolean;
  container: HTMLElement | null;
}) {
  const t = useT();
  const tool = diagramTool(picked);
  const short = (item: DiagramTool) => item.id !== picked && left !== null && left < item.cost;
  const trigger = useRef<HTMLButtonElement>(null);
  // The list opens from the pill but stands on the box's top edge, over it by a
  // little, so it never covers what is being typed. Measured each time, since
  // the box grows with the words.
  const [offset, setOffset] = useState({ side: 6, align: 0 });
  useLayoutEffect(() => {
    const box = trigger.current?.closest('[data-composer]');
    if (!open || !trigger.current || !box) return;
    const pill = trigger.current.getBoundingClientRect();
    const frame = box.getBoundingClientRect();
    setOffset({ side: pill.top - frame.top - 8, align: frame.left + 12 - pill.left });
  }, [open]);

  const onKeyDown = (event: KeyboardEvent) => {
    const item = DIAGRAM_TOOLS[Number(event.key) - 1];
    if (!/^[1-9]$/.test(event.key) || !item || short(item)) return;
    event.preventDefault();
    onPick(item.id === picked ? null : item.id);
    onOpenChange(false);
  };

  return (
    <div className="flex min-w-0 items-center gap-0.5">
      <DropdownMenuPrimitive.Root open={open} onOpenChange={onOpenChange} modal={false}>
        <DropdownMenuPrimitive.Trigger asChild>
          <button
            ref={trigger}
            type="button"
            disabled={disabled}
            className={cn(
              'group inline-flex h-7 min-w-0 items-center gap-1.5 rounded-full border border-[var(--surface-border)] bg-[var(--surface-wash)] pr-2 pl-2.5 text-xs font-medium outline-none hover:bg-[var(--surface-wash-hover)] focus-visible:ring-2 focus-visible:ring-[var(--surface-accent)] disabled:opacity-45 data-[state=open]:bg-[var(--surface-wash-hover)]',
              tool ? 'text-[var(--surface-link)]' : 'text-[var(--surface-fg)]',
            )}
          >
            {tool ? (
              <tool.icon className="size-3.5 shrink-0" aria-hidden="true" />
            ) : (
              <Settings2 className="size-3.5 shrink-0" aria-hidden="true" />
            )}
            <span className="truncate">{tool ? t(tool.label) : t('diagrams.tools')}</span>
            <ChevronDown
              className="size-3 shrink-0 opacity-70 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-data-[state=open]:rotate-180"
              aria-hidden="true"
            />
          </button>
        </DropdownMenuPrimitive.Trigger>
        <DropdownMenuPrimitive.Portal container={container ?? undefined}>
          <DropdownMenuPrimitive.Content
            side="top"
            align="start"
            sideOffset={offset.side}
            alignOffset={offset.align}
            collisionPadding={8}
            aria-label={t('diagrams.tools')}
            onKeyDown={onKeyDown}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              onClosed();
            }}
            className="relative z-(--zIndex-popup) flex max-h-(--radix-dropdown-menu-content-available-height) w-[22rem] max-w-[calc(100vw-2rem)] origin-bottom animate-in fade-in-0 slide-in-from-bottom-2 flex-col overflow-y-auto rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-panel)] p-2 text-[var(--surface-fg)] outline-none duration-300"
          >
            <MenuGlide />
            <div className="flex items-center justify-between px-3 pt-1 pb-2 text-xs text-[var(--surface-fg-muted)]">
              <span>{t('diagrams.pickTool')}</span>
              <span>{t('diagrams.toolsKeys', { keys })}</span>
            </div>
            {DIAGRAM_TOOLS.map((item) => {
              const on = item.id === picked;
              return (
                <DropdownMenuPrimitive.Item
                  key={item.id}
                  disabled={short(item)}
                  onSelect={() => onPick(on ? null : item.id)}
                  title={t(item.row)}
                  className={cn(
                    toolRow,
                    'data-[disabled]:opacity-45',
                    on && 'bg-[var(--surface-wash)]',
                  )}
                >
                  <ToolTile icon={item.icon} color={item.color} />
                  <span className="min-w-0 flex-1 truncate">{t(item.label)}</span>
                  <span
                    className={cn(
                      'inline-flex shrink-0 items-center gap-1 text-xs tabular-nums',
                      on
                        ? 'font-medium text-[var(--surface-link)]'
                        : 'text-[var(--surface-fg-muted)]',
                    )}
                  >
                    ×{item.cost}
                    {on && <Check className="size-3.5" aria-hidden="true" />}
                  </span>
                </DropdownMenuPrimitive.Item>
              );
            })}
            {DIAGRAM_TOOLS_SOON.map((item) => (
              <DropdownMenuPrimitive.Item
                key={item.id}
                disabled
                title={t(item.row)}
                className={toolRow}
              >
                <ToolTile icon={item.icon} color={item.color} />
                <span className="min-w-0 flex-1 truncate text-[var(--surface-fg-muted)]">
                  {t(item.label)}
                </span>
                <span className={soonBadge}>{t('diagrams.soon')}</span>
              </DropdownMenuPrimitive.Item>
            ))}
          </DropdownMenuPrimitive.Content>
        </DropdownMenuPrimitive.Portal>
      </DropdownMenuPrimitive.Root>
      {tool && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onPick(null)}
          aria-label={t('diagrams.clearTool')}
          title={t('diagrams.clearTool')}
          className="grid size-6 shrink-0 place-items-center rounded-full text-[var(--surface-fg-faint)] outline-none hover:bg-[var(--surface-wash)] hover:text-[var(--surface-fg)] focus-visible:ring-2 focus-visible:ring-[var(--surface-accent)] disabled:opacity-45"
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
