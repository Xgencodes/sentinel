import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres = require('postgres');
import * as registrySchema from '../registry/schema';
import * as coreSchema from './core-schema';

const schema = { ...registrySchema, ...coreSchema };
type Schema = typeof schema;

/**
 * One Postgres connection, two Postgres schemas (sentinel_registry,
 * sentinel_core). See src/registry/schema.ts for why the split exists.
 */
@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private db: PostgresJsDatabase<Schema>;
  private client: postgres.Sql;

  async onModuleInit() {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL environment variable is not set');
    }

    this.client = postgres(databaseUrl);
    this.db = drizzle(this.client, { schema });
    this.logger.log('Database connection established');
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.end();
      this.logger.log('Database connection closed');
    }
  }

  getDb(): PostgresJsDatabase<Schema> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    return this.db;
  }
}
