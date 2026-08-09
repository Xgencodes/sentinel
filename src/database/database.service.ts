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

  /**
   * Wipes every sentinel_registry/sentinel_core table — a dev/demo reset,
   * not a product feature. Deliberately leaves ehr-bridge's own tables
   * (public schema: connections, partners, patient_mappings) untouched,
   * since those hold the seeded partner setup the record-transfer flow
   * depends on, not per-run demo data.
   */
  async truncateAll(): Promise<void> {
    if (!this.client) {
      throw new Error('Database not initialized');
    }
    await this.client`
      TRUNCATE TABLE
        sentinel_registry.consent_records,
        sentinel_registry.patients,
        sentinel_registry.specialties,
        sentinel_registry.facilities,
        sentinel_registry.providers,
        sentinel_registry.zones,
        sentinel_core.messages,
        sentinel_core.ussd_sessions,
        sentinel_core.campaigns,
        sentinel_core.placements,
        sentinel_core.escalations,
        sentinel_core.assessments,
        sentinel_core.community_reports,
        sentinel_core.alerts,
        sentinel_core.facility_risk_scores,
        sentinel_core.zone_triggers,
        sentinel_core.feature_rows,
        sentinel_core.climate_signals
      CASCADE
    `;
    this.logger.warn('sentinel_registry/sentinel_core truncated (demo data clear)');
  }
}
