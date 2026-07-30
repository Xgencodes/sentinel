import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { climateSignals } from '../../database/core-schema';
import { AdapterRegistry } from './adapter-registry';
import { SignalWindow } from './source-adapter.interface';

export interface IngestionRunResult {
  zoneId: string;
  source: string;
  recordsWritten: number;
}

/**
 * Runs every registered adapter for a set of zones and persists whatever
 * they return. Adapters that fail (a network error, an unmapped zone) are
 * logged and skipped — one bad feed must not stop ingestion for the rest.
 */
@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly adapters: AdapterRegistry,
  ) {}

  async run(
    zoneIds: string[],
    window: SignalWindow,
  ): Promise<IngestionRunResult[]> {
    const database = this.db.getDb();
    const results: IngestionRunResult[] = [];

    for (const adapter of this.adapters.getAll()) {
      for (const zoneId of zoneIds) {
        try {
          const records = await adapter.fetch(zoneId, window);
          if (records.length > 0) {
            await database.insert(climateSignals).values(
              records.map((r) => ({
                zoneId: r.zoneId,
                source: r.source,
                metric: r.metric,
                value: r.value,
                timestamp: r.timestamp,
              })),
            );
          }
          results.push({
            zoneId,
            source: adapter.source,
            recordsWritten: records.length,
          });
        } catch (error) {
          this.logger.error(
            `Ingestion failed for adapter ${adapter.source}, zone ${zoneId}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
    }

    return results;
  }

  /** Default window: the trailing 21 days, enough for a 2-week lag feature. */
  defaultWindow(): SignalWindow {
    const to = new Date();
    const from = new Date(to.getTime() - 21 * 24 * 60 * 60 * 1000);
    return { from, to };
  }
}
