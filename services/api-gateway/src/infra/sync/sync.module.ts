import { Global, Module } from '@nestjs/common';
import { SyncInternalService } from './sync-internal.service.js';

@Global()
@Module({
  providers: [SyncInternalService],
  exports: [SyncInternalService],
})
export class SyncModule {}
