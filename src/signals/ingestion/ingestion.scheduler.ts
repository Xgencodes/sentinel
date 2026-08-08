import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { IngestionService } from './ingestion.service';
import { DatabaseService } from '../../database/database.service';

/**
 * Runs ingestion on a schedule (requirement 1: "a server that spins off to
 * collect weather data and log them in a database periodically"). Cadence
 * is configurable via INGESTION_CRON; defaults to once daily, which is
 * frequent enough for rainfall/hydrology data without hammering the DHIS2
 * demo instance.
 */
@Injectable()
export class IngestionScheduler {
  private readonly logger = new Logger(IngestionScheduler.name);

  constructor(
    private readonly ingestion: IngestionService,
    private readonly db: DatabaseService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleScheduledIngestion(): Promise<void> {
    if (process.env.INGESTION_ENABLED === 'false') {
      return;
    }

    const database = this.db.getDb();
    const zones = await database.query.zones.findMany();
    const window = this.ingestion.defaultWindow();

    this.logger.log(`Running scheduled ingestion for ${zones.length} zone(s)`);
    const results = await this.ingestion.run(
      zones.map((z) => z.id),
      window,
    );
    this.logger.log(
      `Ingestion complete: ${results.reduce((sum, r) => sum + r.recordsWritten, 0)} record(s) written`,
    );
  }
}
