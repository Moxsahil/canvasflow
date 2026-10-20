import { Injectable, Logger } from '@nestjs/common';
import { setWorkspacePlan, type PlanChangeSource, type SetPlanOutcome } from '@canvasflow/db';
import type { WorkspacePlan } from '@canvasflow/types';
import { DatabaseService } from '../../infra/database/database.service.js';
import { WorkspaceEventsService } from '../workspaces/workspace-events.service.js';

/**
 * Changing what plan a workspace is on, from inside the gateway.
 *
 * No route reaches this: nobody chooses their own plan by asking for it. What
 * calls it is whatever has proof of a payment — the payment provider's
 * confirmation once one is connected. The command line makes the same change
 * through the database package for operators.
 */
@Injectable()
export class PlansService {
  private readonly logger = new Logger(PlansService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly workspaceEvents: WorkspaceEventsService,
  ) {}

  async setPlan(
    workspaceId: string,
    plan: WorkspacePlan,
    source: PlanChangeSource,
    note?: string,
  ): Promise<SetPlanOutcome> {
    const outcome = await setWorkspacePlan(this.database.db, {
      workspaceId,
      plan,
      source,
      ...(note ? { note } : {}),
    });
    if (outcome.ok && outcome.changed) {
      this.logger.log(`Workspace ${workspaceId}: ${outcome.from} → ${outcome.to} (${source})`);
      // Open editors re-read the workspace, so a new allowance shows at once.
      this.workspaceEvents.changed(workspaceId);
    }
    return outcome;
  }
}
