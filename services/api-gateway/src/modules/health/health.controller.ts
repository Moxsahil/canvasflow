import { Controller, Get } from '@nestjs/common';
import { type DatabaseService } from '../../infra/database/database.service.js';
import { sql } from 'drizzle-orm';

interface HealthCheck {
  status: 'ok' | 'degraded';
  uptime: number;
  timestamp: string;
  checks: {
    database: 'ok' | 'fail';
  };
}

@Controller('healthz')
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  @Get()
  async check(): Promise<HealthCheck> {
    const checks: HealthCheck['checks'] = { database: 'ok' };

    try {
      await this.database.db.execute(sql`SELECT 1`);
    } catch {
      checks.database = 'fail';
    }

    const status: HealthCheck['status'] = checks.database === 'ok' ? 'ok' : 'degraded';

    return {
      status,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      checks,
    };
  }
}
