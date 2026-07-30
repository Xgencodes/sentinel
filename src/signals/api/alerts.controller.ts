import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { z } from 'zod';
import { desc } from 'drizzle-orm';
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
}
