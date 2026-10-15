import { useT } from '../i18n';
import { Band, Meter, SettingRow, SettingsButton, SettingsPage, ValueText } from './settings-ui';

/** Billing: the plan, what it allows, and how it is paid for. */
export function BillingPane() {
  const t = useT();
  return (
    <SettingsPage lead={t('settings.section.billing.lead')}>
      <Band title={t('settings.group.plan')}>
        <SettingRow setting="plan" title={t('billing.freePlan')} hint={t('billing.freePlanHint')}>
          <SettingsButton variant="primary">{t('billing.upgrade')}</SettingsButton>
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
