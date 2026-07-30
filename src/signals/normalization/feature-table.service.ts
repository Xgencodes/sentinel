import { Injectable } from '@nestjs/common';
import { eq, and, gte } from 'drizzle-orm';
import { DatabaseService } from '../../database/database.service';
import { climateSignals, featureRows } from '../../database/core-schema';
import { buildFeatureTable, FeatureRow } from './feature-table';

@Injectable()
export class FeatureTableService {
  constructor(private readonly db: DatabaseService) {}

  /** Rebuilds and persists feature rows for a zone from its raw signal history. */
  async rebuildForZone(zoneId: string, sinceWeeks = 8): Promise<FeatureRow[]> {
    const database = this.db.getDb();
    const since = new Date(Date.now() - sinceWeeks * 7 * 24 * 60 * 60 * 1000);

    const rawSignals = await database.query.climateSignals.findMany({
      where: and(
        eq(climateSignals.zoneId, zoneId),
        gte(climateSignals.timestamp, since),
      ),
    });

    const rows = buildFeatureTable(
      rawSignals.map((r) => ({
        zoneId: r.zoneId,
        source: r.source,
        metric: r.metric as any,
        value: r.value,
        timestamp: r.timestamp,
      })),
    );

    for (const row of rows) {
      await database.insert(featureRows).values({
        zoneId: row.zoneId,
        epiWeek: row.epiWeek,
        rainfallMm: row.rainfallMm,
        rainfallMmLag1: row.rainfallMmLag1,
        rainfallMmLag2: row.rainfallMmLag2,
        standingWaterDays: row.standingWaterDays,
        caseCount: row.caseCount,
        caseCountLag1: row.caseCountLag1,
        caseCountRolling4wkAvg: row.caseCountRolling4wkAvg,
      });
    }

    return rows;
  }
}
