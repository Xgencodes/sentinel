import { Controller, Get, Param, NotFoundException } from '@nestjs/common';
import { eq, desc } from 'drizzle-orm';
import { DatabaseService } from '../../database/database.service';
import { facilityRiskScores } from '../../database/core-schema';

@Controller('v1/facilities')
export class RiskController {
  constructor(private readonly db: DatabaseService) {}

  /** This clinic should expect surge — for clinicians and district authorities. */
  @Get(':id/risk-score')
  async getLatestRiskScore(@Param('id') id: string) {
    const database = this.db.getDb();
    const latest = await database.query.facilityRiskScores.findFirst({
      where: eq(facilityRiskScores.facilityId, id),
      orderBy: [desc(facilityRiskScores.epiWeek)],
    });
    if (!latest) {
      throw new NotFoundException(
        `No risk score evaluated yet for facility ${id}`,
      );
    }
    return {
      ...latest,
      disclaimer:
        'BASELINE — illustrative, synthetic data only. Not clinically validated. Not for operational use.',
    };
  }
}
