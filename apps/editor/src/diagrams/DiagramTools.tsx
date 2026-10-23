import type { KeyboardEvent } from 'react';
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
          tool ? 'text-[var(--surface-accent)]' : 'text-[var(--surface-fg-faint)]',
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
            type="button"
            disabled={disabled}
            className={cn(
              'group inline-flex h-7 min-w-0 items-center gap-1.5 rounded-full border border-[var(--surface-border)] pr-2 pl-2.5 text-xs font-medium outline-none hover:bg-[var(--surface-wash)] focus-visible:ring-2 focus-visible:ring-[var(--surface-accent)] disabled:opacity-45 data-[state=open]:bg-[var(--surface-wash)]',
              tool ? 'text-[var(--surface-accent)]' : 'text-[var(--surface-fg)]',
            )}
          >
            {tool ? (
              <tool.icon className="size-3.5 shrink-0" aria-hidden="true" />
            ) : (
              <Settings2 className="size-3.5 shrink-0" aria-hidden="true" />
            )}
            <span className="truncate">{tool ? t(tool.label) : t('diagrams.tools')}</span>
            <ChevronDown
              className="size-3 shrink-0 opacity-70 transition-transform duration-150 group-data-[state=open]:rotate-180"
              aria-hidden="true"
            />
          </button>
        </DropdownMenuPrimitive.Trigger>
        <DropdownMenuPrimitive.Portal container={container ?? undefined}>
          <DropdownMenuPrimitive.Content
            side="top"
            align="start"
            sideOffset={6}
            collisionPadding={8}
            aria-label={t('diagrams.tools')}
            onKeyDown={onKeyDown}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              onClosed();
            }}
            className="z-(--zIndex-popup) flex max-h-(--radix-dropdown-menu-content-available-height) w-72 flex-col gap-0.5 overflow-y-auto rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-1 text-[var(--surface-fg)] shadow-[var(--surface-shadow)] outline-none"
          >
            <div className="flex items-center justify-between px-2 pt-1 pb-1 text-[11px] text-[var(--surface-fg-faint)]">
              <span>{t('diagrams.tools')}</span>
              <span>{t('diagrams.toolsKeys', { keys })}</span>
            </div>
            {DIAGRAM_TOOLS.map((item, index) => {
              const on = item.id === picked;
              return (
                <DropdownMenuPrimitive.Item
                  key={item.id}
                  disabled={short(item)}
                  onSelect={() => onPick(on ? null : item.id)}
                  className="flex cursor-default items-start gap-2.5 rounded-lg px-2 py-1.5 outline-none select-none data-[disabled]:opacity-45 data-[highlighted]:bg-[var(--surface-wash)]"
                >
                  <item.icon
                    className="mt-0.5 size-4 shrink-0"
                    style={{ color: item.color }}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12.5px] leading-[1.35] font-medium">
                      {t(item.label)}
                      <span className="ml-1.5 font-normal text-[var(--surface-fg-faint)] tabular-nums">
                        ×{item.cost}
                      </span>
                    </span>
                    <span className="block text-[11.5px] leading-[1.35] text-[var(--surface-fg-muted)]">
                      {t(item.row)}
                    </span>
                  </span>
                  {on ? (
                    <Check
                      className="mt-0.5 size-3.5 shrink-0 text-[var(--surface-fg)]"
                      aria-hidden="true"
                    />
                  ) : (
                    <kbd className={cn(kbd, 'mt-0.5')}>{index + 1}</kbd>
                  )}
                </DropdownMenuPrimitive.Item>
              );
            })}
            <DropdownMenuPrimitive.Separator className="mx-1 my-1 h-px bg-[var(--surface-line)]" />
            <div className="px-2 pt-0.5 pb-1 text-[11px] text-[var(--surface-fg-faint)]">
              {t('diagrams.comingSoon')}
            </div>
            {DIAGRAM_TOOLS_SOON.map((item) => (
              <DropdownMenuPrimitive.Item
                key={item.id}
                disabled
                className="flex cursor-default items-start gap-2.5 rounded-lg px-2 py-1.5 outline-none select-none"
              >
                <item.icon
                  className="mt-0.5 size-4 shrink-0"
                  style={{ color: item.color }}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] leading-[1.35] font-medium text-[var(--surface-fg-muted)]">
                    {t(item.label)}
                  </span>
                  <span className="block text-[11.5px] leading-[1.35] text-[var(--surface-fg-muted)]">
                    {t(item.row)}
                  </span>
                </span>
                <span className={cn(soonBadge, 'mt-0.5')}>{t('diagrams.soon')}</span>
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
