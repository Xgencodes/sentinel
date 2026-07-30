import {
  Controller,
  Get,
  Post,
  Param,
  NotFoundException,
} from '@nestjs/common';
import { eq, desc } from 'drizzle-orm';
import { DatabaseService } from '../../database/database.service';
import { zoneTriggers } from '../../database/core-schema';
import { ZoneTriggerService } from '../zones/zone-trigger.service';

@Controller('v1/zones')
export class ZonesSignalsController {
  constructor(
    private readonly db: DatabaseService,
    private readonly zoneTrigger: ZoneTriggerService,
  ) {}

  /** This area is now in a risk window — consumed by cohort resolution and dispatch. */
  @Get(':id/trigger')
  async getLatestTrigger(@Param('id') id: string) {
    const database = this.db.getDb();
    const latest = await database.query.zoneTriggers.findFirst({
      where: eq(zoneTriggers.zoneId, id),
      orderBy: [desc(zoneTriggers.epiWeek)],
    });
    if (!latest) {
      throw new NotFoundException(`No trigger evaluated yet for zone ${id}`);
    }
    return latest;
  }

  /** Runs evaluation now rather than waiting for the schedule — used by the demo scenario. */
  @Post(':id/evaluate')
  async evaluate(@Param('id') id: string) {
    return this.zoneTrigger.evaluateZone(id);
  }
}
