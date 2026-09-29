import { Band, Meter, SettingRow, SettingsButton, SettingsPage, ValueText } from './settings-ui';

/** Billing: the plan, what it allows, and how it is paid for. */
export function BillingPane() {
  return (
    <SettingsPage lead="Plan, seats, usage, and invoice history.">
      <Band title="Plan" description="What this workspace is on today.">
        <SettingRow
          setting="plan"
          title={<span className="text-[14px] font-semibold">Free plan</span>}
          hint="3 of 3 boards used, 1 collaborator per board"
        >
          <SettingsButton variant="primary">Upgrade</SettingsButton>
        </SettingRow>
      </Band>

      <Band title="Usage" description="Measured against the plan's limits.">
        <SettingRow setting="seats" title="Seats" hint="Collaborators with edit access">
          <ValueText>1 of 1</ValueText>
        </SettingRow>
        <SettingRow setting="storage" title="Storage" hint="Board snapshots and exported images">
          <Meter used={48} total={100} label="48 MB of 100 MB" />
        </SettingRow>
      </Band>

      <Band title="Payment" description="The card, and receipts for what it paid.">
        <SettingRow setting="payment-method" title="Payment method" hint="No card on file">
          <SettingsButton>Add card</SettingsButton>
        </SettingRow>
        <SettingRow setting="invoices" title="Invoices" hint="Receipts for past billing periods">
          <SettingsButton>View history</SettingsButton>
        </SettingRow>
      </Band>
    </SettingsPage>
  );
}
