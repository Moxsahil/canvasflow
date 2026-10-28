import { PLAN_ALLOWANCES, PLAN_NAMES } from '@canvasflow/types';
import { useT } from '../i18n';
import { Band, Meter, SettingRow, SettingsButton, SettingsPage, ValueText } from './settings-ui';
import type { WorkspaceSettingsSource } from './WorkspacePane';

interface BillingPaneProps {
  /** The workspace the sidebar is showing, whose plan this is. */
  workspace?: WorkspaceSettingsSource;
  /** Opens the plan picker for that workspace. */
  onUpgrade?: (workspaceId: string) => void;
}

/** Billing: the plan, what it allows, and how it is paid for. */
export function BillingPane({ workspace, onUpgrade }: BillingPaneProps) {
  const t = useT();
  const listed =
    workspace?.status === 'ready'
      ? workspace.workspace
      : workspace?.status === 'shared'
        ? workspace.own
        : null;
  const plan = listed?.plan ?? 'free';
  const allowance = PLAN_ALLOWANCES[plan];
  return (
    <SettingsPage lead={t('settings.section.billing.lead')}>
      <Band title={t('settings.group.plan')}>
        <SettingRow
          setting="plan"
          title={t('billing.planTitle', { plan: PLAN_NAMES[plan] })}
          hint={t('billing.planHint', {
            diagrams: allowance.diagramsPerMonth,
            storage: allowance.storageGb,
          })}
        >
          {listed && plan === 'free' && onUpgrade && (
            <SettingsButton variant="primary" onClick={() => onUpgrade(listed.id)}>
              {t('billing.upgrade')}
            </SettingsButton>
          )}
        </SettingRow>
      </Band>

      <Band title={t('settings.group.usage')}>
        <SettingRow setting="seats" title={t('settings.row.seats')} hint={t('billing.seatsHint')}>
          <ValueText>{t('billing.seatsValue', { used: 1, total: 1 })}</ValueText>
        </SettingRow>
        <SettingRow
          setting="storage"
          title={t('settings.row.storage')}
          hint={t('billing.storageHint')}
        >
          <Meter
            used={48}
            total={100}
            label={t('billing.storageValue', { used: '48 MB', total: '100 MB' })}
          />
        </SettingRow>
      </Band>

      <Band title={t('settings.group.payment')}>
        <SettingRow
          setting="payment-method"
          title={t('settings.row.payment-method')}
          hint={t('billing.noCard')}
        >
          <SettingsButton>{t('billing.addCard')}</SettingsButton>
        </SettingRow>
        <SettingRow
          setting="invoices"
          title={t('settings.row.invoices')}
          hint={t('billing.invoicesHint')}
        >
          <SettingsButton>{t('billing.viewHistory')}</SettingsButton>
        </SettingRow>
      </Band>
    </SettingsPage>
  );
}
