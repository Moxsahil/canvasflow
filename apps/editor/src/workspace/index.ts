export { WorkspaceSwitcher } from './WorkspaceSwitcher';
export { ManageDialog } from './ManageDialog';
export { RenameBoardDialog } from './RenameBoardDialog';
export {
  useBoardSwitcher,
  type BoardSwitcherState,
  type ManageTarget,
  type RenameBoardTarget,
} from './useBoardSwitcher';
export type { BoardColor, BoardSummary, WorkspaceSummary } from './workspace-api';
export { announceWorkspaceChanged, useWorkspaceChanges } from './workspace-events';
