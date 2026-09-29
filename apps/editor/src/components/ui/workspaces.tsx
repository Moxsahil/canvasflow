import * as React from 'react';
import { CheckIcon, ChevronsUpDownIcon } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  menuButtonRowClasses,
  menuLabelClasses,
  menuPopoverClasses,
  menuSeparatorClasses,
} from './menu-look';

/**
 * A workspace switcher: a trigger that names the current workspace, and a
 * popover listing the rest.
 *
 * Generic over the caller's own workspace shape — everything it needs is
 * reachable through `getWorkspaceId` / `getWorkspaceName`, and both the
 * trigger and each row can be rendered wholesale by the caller. The trigger
 * wears the sidebar's chrome tokens, being a row of it; the popover wears the
 * editor's menu look, like the other menus that open from the sidebar.
 */

export interface Workspace {
  id: string;
  name: string;
  /** Read by the default renderers; a caller's own row renderer may ignore both. */
  logo?: string;
  plan?: string;
}

interface WorkspaceContextValue<T extends Workspace> {
  open: boolean;
  setOpen: (open: boolean) => void;
  selectedWorkspace: T | undefined;
  workspaces: T[];
  onWorkspaceSelect: (workspace: T) => void;
  getWorkspaceId: (workspace: T) => string;
  getWorkspaceName: (workspace: T) => string;
}

const WorkspaceContext = React.createContext<WorkspaceContextValue<Workspace> | null>(null);

function useWorkspaceContext<T extends Workspace>() {
  const context = React.useContext(WorkspaceContext) as WorkspaceContextValue<T> | null;
  if (!context) {
    throw new Error('Workspace components must be used within WorkspaceProvider');
  }
  return context;
}

interface WorkspaceProviderProps<T extends Workspace> {
  children: React.ReactNode;
  workspaces: T[];
  selectedWorkspaceId?: string;
  onWorkspaceChange?: (workspace: T) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  getWorkspaceId?: (workspace: T) => string;
  getWorkspaceName?: (workspace: T) => string;
  /**
   * Whether picking a workspace dismisses the popover. False when selecting
   * one only reveals more of the same menu — the editor expands the chosen
   * workspace's boards beside it, and closing would take that away.
   */
  closeOnSelect?: boolean;
}

function WorkspaceProvider<T extends Workspace>({
  children,
  workspaces,
  selectedWorkspaceId,
  onWorkspaceChange,
  open: controlledOpen,
  onOpenChange,
  getWorkspaceId = (workspace) => workspace.id,
  getWorkspaceName = (workspace) => workspace.name,
  closeOnSelect = true,
}: WorkspaceProviderProps<T>) {
  const [internalOpen, setInternalOpen] = React.useState(false);

  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  const selectedWorkspace = React.useMemo(() => {
    if (!selectedWorkspaceId) return workspaces[0];
    return workspaces.find((ws) => getWorkspaceId(ws) === selectedWorkspaceId) || workspaces[0];
  }, [workspaces, selectedWorkspaceId, getWorkspaceId]);

  const handleWorkspaceSelect = React.useCallback(
    (workspace: T) => {
      onWorkspaceChange?.(workspace);
      if (closeOnSelect) setOpen(false);
    },
    [onWorkspaceChange, setOpen, closeOnSelect],
  );

  const value: WorkspaceContextValue<T> = {
    open,
    setOpen,
    selectedWorkspace,
    workspaces,
    onWorkspaceSelect: handleWorkspaceSelect,
    getWorkspaceId,
    getWorkspaceName,
  };

  // The provider is generic but a context can only hold one type, so it holds
  // the base shape and useWorkspaceContext casts back to the caller's own.
  // Through `unknown` because a subtype's callbacks don't narrow.
  return (
    <WorkspaceContext.Provider value={value as unknown as WorkspaceContextValue<Workspace>}>
      <Popover open={open} onOpenChange={setOpen}>
        {children}
      </Popover>
    </WorkspaceContext.Provider>
  );
}

interface WorkspaceTriggerProps extends React.ComponentProps<'button'> {
  renderTrigger?: (workspace: Workspace, isOpen: boolean) => React.ReactNode;
}

/**
 * Forwards its ref to the button so a wrapper can drive it — the sidebar hangs
 * this off `SidebarMenuButton asChild`, and Radix's Slot needs a ref to reach.
 * Composed with the popover's own, which Slot merges rather than replaces.
 */
const WorkspaceTrigger = React.forwardRef<HTMLButtonElement, WorkspaceTriggerProps>(
  function WorkspaceTrigger({ className, renderTrigger, ...props }, ref) {
    const { open, selectedWorkspace, getWorkspaceName } = useWorkspaceContext();

    if (!selectedWorkspace) return null;

    if (renderTrigger) {
      return (
        <PopoverTrigger asChild>
          <button ref={ref} type="button" className={className} {...props}>
            {renderTrigger(selectedWorkspace, open)}
          </button>
        </PopoverTrigger>
      );
    }

    return (
      <PopoverTrigger asChild>
        <button
          ref={ref}
          type="button"
          data-state={open ? 'open' : 'closed'}
          className={cn(
            'flex h-12 w-full max-w-72 items-center justify-between rounded-md border border-sidebar-border bg-sidebar px-3 py-2 text-sm text-sidebar-foreground',
            'outline-hidden ring-sidebar-ring focus-visible:ring-2',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
            className,
          )}
          {...props}
        >
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Avatar className="size-6 rounded-md">
              <AvatarImage src={selectedWorkspace.logo} alt={getWorkspaceName(selectedWorkspace)} />
              <AvatarFallback>
                {getWorkspaceName(selectedWorkspace).charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="truncate">{getWorkspaceName(selectedWorkspace)}</span>
          </div>
          <ChevronsUpDownIcon className="size-4 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>
    );
  },
);

interface WorkspaceContentProps extends React.ComponentProps<typeof PopoverContent> {
  renderWorkspace?: (workspace: Workspace, isSelected: boolean) => React.ReactNode;
  title?: string;
  searchable?: boolean;
  onSearch?: (query: string) => void;
}

function WorkspaceContent({
  className,
  children,
  renderWorkspace,
  title = 'Workspaces',
  searchable = false,
  onSearch,
  ...props
}: WorkspaceContentProps) {
  const { workspaces, selectedWorkspace, onWorkspaceSelect, getWorkspaceId, getWorkspaceName } =
    useWorkspaceContext();

  const [searchQuery, setSearchQuery] = React.useState('');

  const filteredWorkspaces = React.useMemo(() => {
    if (!searchQuery) return workspaces;
    return workspaces.filter((ws) =>
      getWorkspaceName(ws).toLowerCase().includes(searchQuery.toLowerCase()),
    );
  }, [workspaces, searchQuery, getWorkspaceName]);

  React.useEffect(() => {
    onSearch?.(searchQuery);
  }, [searchQuery, onSearch]);

  const defaultRenderWorkspace = (workspace: Workspace, isSelected: boolean) => (
    <>
      <span className="min-w-0 truncate">{getWorkspaceName(workspace)}</span>
      <span className="ml-auto flex shrink-0 items-center gap-2">
        {workspace.plan && (
          <span className="text-[10px] text-neutral-500 dark:text-neutral-400">
            {workspace.plan}
          </span>
        )}
        {isSelected && <CheckIcon className="size-4" />}
      </span>
    </>
  );

  return (
    <PopoverContent
      className={cn(menuPopoverClasses, 'overflow-hidden', className)}
      align={props.align || 'start'}
      {...props}
    >
      <p className={menuLabelClasses}>{title}</p>

      {searchable && (
        <input
          type="text"
          placeholder="Search workspaces..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded bg-transparent px-2 py-1.5 text-xs outline-none placeholder:text-neutral-500 dark:placeholder:text-neutral-400"
        />
      )}

      <div className="flex max-h-75 w-full flex-col gap-y-1 overflow-y-auto">
        {filteredWorkspaces.length === 0 ? (
          <p className="px-2 py-1.5 text-xs text-neutral-500 dark:text-neutral-400">
            No workspaces found
          </p>
        ) : (
          filteredWorkspaces.map((workspace) => {
            const isSelected =
              selectedWorkspace && getWorkspaceId(selectedWorkspace) === getWorkspaceId(workspace);

            return (
              <button
                key={getWorkspaceId(workspace)}
                type="button"
                onClick={() => onWorkspaceSelect(workspace)}
                // A caller's row marks itself `data-expanded` while whatever it
                // opens beside the list is up, and stays lit for as long.
                className={cn(
                  menuButtonRowClasses,
                  'has-data-expanded:bg-neutral-950/10 dark:has-data-expanded:bg-neutral-50/10',
                )}
              >
                {renderWorkspace
                  ? renderWorkspace(workspace, !!isSelected)
                  : defaultRenderWorkspace(workspace, !!isSelected)}
              </button>
            );
          })
        )}
      </div>

      {children && (
        <>
          <div role="separator" className={menuSeparatorClasses} />
          {children}
        </>
      )}
    </PopoverContent>
  );
}

export { WorkspaceProvider as Workspaces, WorkspaceTrigger, WorkspaceContent };
