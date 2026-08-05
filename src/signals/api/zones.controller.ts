import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  NotFoundException,
} from '@nestjs/common';
import { eq, desc } from 'drizzle-orm';
import { z } from 'zod';
import { DatabaseService } from '../../database/database.service';
import { zoneTriggers } from '../../database/core-schema';
import { ZoneTriggerService } from '../zones/zone-trigger.service';

const EvaluateZoneSchema = z.object({
  /** Lets a caller (e.g. the demo scenario) thread one journey's
   * correlationId through zone evaluation, cohort resolution, dispatch,
   * triage and escalation, so the whole chain reconstructs as one timeline. */
  correlationId: z.string().optional(),
});

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
  async evaluate(@Param('id') id: string, @Body() body: unknown) {
    const { correlationId } = EvaluateZoneSchema.parse(body ?? {});
    return this.zoneTrigger.evaluateZone(id, correlationId);
  }
}
