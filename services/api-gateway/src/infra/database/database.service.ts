import { parseEnv } from '@/config/env';
import { createClient, type Database } from '@canvasflow/db';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private _db: Database | null = null;

  onModuleInit(): void {
    const env = parseEnv();
    this._db = createClient(env.DATABASE_URL);
  }
  onModuleDestroy(): void {
    this._db = null;
  }

  get db(): Database {
    if (!this._db) {
      throw new Error('Database not initialized. Did the module fail to init?');
    }
    return this._db;
  }
}
