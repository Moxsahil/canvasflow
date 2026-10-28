import type { ModuleRef } from '@nestjs/core';
import { BillingService } from './billing.service.js';

/**
 * Brings a Team plan's seats to the member count, from a module that cannot
 * import billing: billing reads plans, plans reads workspaces, and workspaces
 * and notifications are where members come and go. Resolved when called, so
 * no module imports another in a circle. Never throws.
 */
export function syncSeatsLater(moduleRef: ModuleRef, workspaceId: string): void {
  try {
    void moduleRef.get(BillingService, { strict: false }).syncSeats(workspaceId);
  } catch {
    // Billing not loaded (a test module): there are no seats to keep in step.
  }
}
