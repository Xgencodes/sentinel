import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';
import { DatabaseService } from '../../database/database.service';
import { alerts } from '../../database/core-schema';
import { AlertNotifier } from '../alerts/alert-notifier.interface';
import { ALERT_NOTIFIER } from '../zones/zone-trigger.tokens';
import { Inject } from '@nestjs/common';

const ManualAlertSchema = z.object({
  zoneId: z.string().uuid().optional(),
  facilityId: z.string().uuid().optional(),
  band: z.string(),
  message: z.string(),
});

const DismissAlertSchema = z.object({
  reason: z.string().optional(),
});

@Controller('v1/alerts')
export class AlertsController {
  constructor(
    private readonly db: DatabaseService,
    @Inject(ALERT_NOTIFIER) private readonly alertNotifier: AlertNotifier,
  ) {}

  @Get()
  async findAll(@Query('limit') limit?: string) {
    const database = this.db.getDb();
    return database.query.alerts.findMany({
      orderBy: [desc(alerts.createdAt)],
      limit: limit ? Number(limit) : 50,
    });
  }

  /** For manual testing of the notification path without a real trigger. */
  @Post()
  async create(@Body() body: unknown) {
    try {
      const validated = ManualAlertSchema.parse(body);
      const database = this.db.getDb();
      const [alert] = await database
        .insert(alerts)
        .values(validated)
        .returning();
      await this.alertNotifier.notify(validated);
      return alert;
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new BadRequestException(error.issues.map((i) => i.message));
      }
      throw error;
    }
  }

  /** Closes a risk episode early on human judgment — e.g. a CHW confirms it was a false positive. */
  @Patch(':id/dismiss')
  async dismiss(@Param('id') id: string, @Body() body: unknown) {
    try {
      const validated = DismissAlertSchema.parse(body ?? {});
      const database = this.db.getDb();
      const [updated] = await database
        .update(alerts)
        .set({
          status: 'dismissed',
          resolvedAt: new Date(),
          resolvedReason: validated.reason ?? 'Dismissed by operator',
        })
        .where(eq(alerts.id, id))
        .returning();
      if (!updated) {
        throw new NotFoundException(`Alert ${id} not found`);
      }
      return updated;
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new BadRequestException(error.issues.map((i) => i.message));
      }
      throw error;
    }
  }
}
