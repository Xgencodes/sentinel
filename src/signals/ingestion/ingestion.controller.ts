import { Controller, Post, Body, BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { IngestionService } from './ingestion.service';

const RunIngestionSchema = z.object({
  zoneIds: z.array(z.string().uuid()).min(1),
  fromDate: z.coerce.date().optional(),
  toDate: z.coerce.date().optional(),
});

@Controller('v1/ingestion')
export class IngestionController {
  constructor(private readonly ingestion: IngestionService) {}

  /** Manual trigger, used by the demo scenario and for testing. */
  @Post('run')
  async run(@Body() body: unknown) {
    try {
      const validated = RunIngestionSchema.parse(body);
      const window =
        validated.fromDate && validated.toDate
          ? { from: validated.fromDate, to: validated.toDate }
          : this.ingestion.defaultWindow();

      return await this.ingestion.run(validated.zoneIds, window);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new BadRequestException(error.issues.map((i) => i.message));
      }
      throw error;
    }
  }
}
