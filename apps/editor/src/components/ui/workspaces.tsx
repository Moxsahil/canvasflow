import * as React from 'react';
import { CheckIcon, ChevronsUpDownIcon } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

/**
 * A workspace switcher: a trigger that names the current workspace, and a
 * popover listing the rest.
 *
 * Generic over the caller's own workspace shape — everything it needs is
 * reachable through `getWorkspaceId` / `getWorkspaceName`, and both the
 * trigger and each row can be rendered wholesale by the caller. Colours are
 * the editor's chrome tokens rather than the component palette, because this
 * lives in the sidebar next to the dropdown menus.
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
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <Avatar className="size-6 rounded-md">
        <AvatarImage src={workspace.logo} alt={getWorkspaceName(workspace)} />
        <AvatarFallback>{getWorkspaceName(workspace).charAt(0).toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-1 flex-col items-start">
        <span className="truncate text-sm">{getWorkspaceName(workspace)}</span>
        {workspace.plan && <span className="text-xs opacity-60">{workspace.plan}</span>}
      </div>
      {isSelected && <CheckIcon className="ml-auto h-4 w-4" />}
    </div>
  );

  return (
    <PopoverContent className={cn('p-0', className)} align={props.align || 'start'} {...props}>
      <div className="border-b border-sidebar-border px-3 py-2">
        <p className="text-xs font-medium text-sidebar-foreground/70">{title}</p>
      </div>

      {searchable && (
        <div className="border-b border-sidebar-border px-3 py-2">
          <input
            type="text"
            placeholder="Search workspaces..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full border-none bg-transparent text-sm outline-hidden placeholder:text-sidebar-foreground/50"
          />
        </div>
      )}

      <div className="max-h-[300px] overflow-y-auto">
        {filteredWorkspaces.length === 0 ? (
          <div className="px-3 py-2 text-center text-sm text-sidebar-foreground/70">
            No workspaces found
          </div>
        ) : (
          <div className="p-1">
            {filteredWorkspaces.map((workspace) => {
              const isSelected =
                selectedWorkspace &&
                getWorkspaceId(selectedWorkspace) === getWorkspaceId(workspace);

              return (
                <button
                  key={getWorkspaceId(workspace)}
                  type="button"
                  onClick={() => onWorkspaceSelect(workspace)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm',
                    'outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:bg-sidebar-accent',
                    isSelected && 'bg-sidebar-accent text-sidebar-accent-foreground',
                  )}
                >
                  {renderWorkspace
                    ? renderWorkspace(workspace, !!isSelected)
                    : defaultRenderWorkspace(workspace, !!isSelected)}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {children && (
        <>
          <div className="border-t border-sidebar-border" />
          <div className="p-1">{children}</div>
        </>
      )}
    </PopoverContent>
  );
}

export { WorkspaceProvider as Workspaces, WorkspaceTrigger, WorkspaceContent };
