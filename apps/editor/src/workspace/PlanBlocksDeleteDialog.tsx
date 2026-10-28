import { useId } from 'react';
import { PLAN_NAMES, type WorkspacePlan } from '@canvasflow/types';
import { useT } from '../i18n';
import { SurfaceWindow, WindowButton, WindowFooter, WindowHeader } from '../ui/SurfaceWindow';
import type { SurfaceTheme } from '../ui/surface-palette';

/** The workspace whose delete waits on its plan, and when that plan next renews. */
export interface PlanBlock {
  workspaceId: string;
  workspaceName: string;
  plan: WorkspacePlan;
  /** Already formatted, or null when the provider has not said. */
  renewsOn: string | null;
}

/**
 * In place of the delete warning, while the workspace's plan still renews: a
 * deleted workspace must never be charged for, so the plan is cancelled first,
 * in Settings → Billing, where the owner sees what they are giving up.
 */
export function PlanBlocksDeleteDialog({
  block,
  theme,
  onClose,
  onOpenBilling,
}: {
  block: PlanBlock | null;
  theme: SurfaceTheme;
  onClose: () => void;
  /** Opens Settings at Billing on that workspace. Without it, the window only explains. */
  onOpenBilling?: (workspaceId: string) => void;
}) {
  const t = useT();
  const titleId = useId();
  const descriptionId = useId();
  const plan = block ? PLAN_NAMES[block.plan] : '';

  return (
    <SurfaceWindow
      open={block !== null}
      theme={theme}
      onClose={onClose}
      width={440}
      labelledBy={titleId}
      describedBy={descriptionId}
      alert
      data-testid="plan-blocks-delete"
    >
      <WindowHeader
        titleId={titleId}
        title={t('manage.planFirstTitle')}
        description={
          block
            ? block.renewsOn
              ? t('manage.planFirst', { name: block.workspaceName, plan, date: block.renewsOn })
              : t('manage.planFirstNoDate', { name: block.workspaceName, plan })
            : ''
        }
        descriptionId={descriptionId}
        onClose={onClose}
      />
      <WindowFooter>
        <WindowButton variant="ghost" onClick={onClose}>
          {t('common.close')}
        </WindowButton>
        {block && onOpenBilling && (
          <WindowButton
            variant="primary"
            autoFocus
            onClick={() => onOpenBilling(block.workspaceId)}
          >
            {t('manage.openBilling')}
          </WindowButton>
        )}
      </WindowFooter>
    </SurfaceWindow>
  );
}
