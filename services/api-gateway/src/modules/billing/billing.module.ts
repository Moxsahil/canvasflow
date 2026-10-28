import { Module } from '@nestjs/common';
import { parseEnv } from '../../config/env.js';
import { PlansModule } from '../plans/plans.module.js';
import { BILLING_PROVIDER } from './billing-provider.js';
import { BillingController } from './billing.controller.js';
import { BillingService } from './billing.service.js';
import { PolarBillingProvider } from './polar-billing-provider.js';

/**
 * Buying plans through Polar. Without a Polar token the provider is absent and
 * the routes say payments aren't set up, while every other route carries on.
 */
@Module({
  imports: [PlansModule],
  controllers: [BillingController],
  providers: [
    BillingService,
    {
      provide: BILLING_PROVIDER,
      useFactory: () => {
        const env = parseEnv();
        return env.POLAR_ACCESS_TOKEN
          ? new PolarBillingProvider(
              env.POLAR_ACCESS_TOKEN,
              env.POLAR_ENVIRONMENT,
              env.POLAR_WEBHOOK_SECRET,
            )
          : null;
      },
    },
  ],
})
export class BillingModule {}
