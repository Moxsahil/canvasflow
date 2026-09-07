import {
  Card,
  GroupLabel,
  Meter,
  Row,
  RowText,
  SecondaryButton,
  SettingsPane,
  ValueText,
} from './settings-ui';

/** Billing: the plan, what it allows, and how it is paid for. */
export function BillingPane({ onClose }: { onClose: () => void }) {
  return (
    <SettingsPane
      title="Billing"
      subtitle="Plan, seats, usage, and invoice history."
      onClose={onClose}
    >
      <GroupLabel>Plan</GroupLabel>
      {/* The one card in the dialog that is not a stack of rows: the plan is
          the whole card, so its title sits larger and its padding is even. */}
      <Card>
        <div className="flex w-full items-center gap-[16px] px-[18px] py-[18px]">
          <div className="flex min-w-0 flex-1 flex-col gap-[5px]">
            <p className="text-[15px] font-semibold text-[var(--settings-fg)]">Free plan</p>
            <p className="text-[11px] text-[var(--settings-fg-faint)]">
              3 of 3 boards used, 1 collaborator per board
            </p>
          </div>
          <SecondaryButton>Upgrade</SecondaryButton>
        </div>
      </Card>

      <GroupLabel>Usage</GroupLabel>
      <Card>
        <Row>
          <RowText title="Seats" hint="Collaborators with edit access" />
          <ValueText>1 of 1</ValueText>
        </Row>
        <Row>
          <RowText title="Storage" hint="Board snapshots and exported images" />
          <Meter used={48} total={100} label="48 MB of 100 MB" />
        </Row>
      </Card>

      <GroupLabel>Payment</GroupLabel>
      <Card>
        <Row>
          <RowText title="Payment method" hint="No card on file" />
          <SecondaryButton>Add card</SecondaryButton>
        </Row>
        <Row>
          <RowText title="Invoices" hint="Receipts for past billing periods" />
          <SecondaryButton>View history</SecondaryButton>
        </Row>
      </Card>
    </SettingsPane>
  );
}
