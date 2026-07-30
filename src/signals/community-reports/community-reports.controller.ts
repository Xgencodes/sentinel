import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  BadRequestException,
} from '@nestjs/common';
import { z } from 'zod';
import { CommunityReportsService } from './community-reports.service';

const SubmitReportSchema = z.object({
  zoneId: z.string().uuid(),
  reporterMsisdn: z.string().optional(),
  reportType: z.enum([
    'flooding',
    'standing_water',
    'impassable_road',
    'contaminated_water',
    'illness_cluster',
  ]),
  severity: z.string().optional(),
  freeText: z.string().optional(),
  intakeChannel: z.enum(['ussd', 'hotline-admin']),
});

const VerifyReportSchema = z.object({
  verifiedByChwId: z.string().uuid(),
  outcome: z.enum(['chw-confirmed', 'dismissed']),
});

@Controller('v1/community-reports')
export class CommunityReportsController {
  constructor(private readonly reportsService: CommunityReportsService) {}

  @Post()
  async submit(@Body() body: unknown) {
    try {
      const validated = SubmitReportSchema.parse(body);
      return await this.reportsService.submit(validated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new BadRequestException(error.issues.map((i) => i.message));
      }
      throw error;
    }
  }

  @Post(':id/verify')
  async verify(@Param('id') id: string, @Body() body: unknown) {
    try {
      const validated = VerifyReportSchema.parse(body);
      return await this.reportsService.verify(
        id,
        validated.verifiedByChwId,
        validated.outcome,
      );
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new BadRequestException(error.issues.map((i) => i.message));
      }
      throw error;
    }
  }

  @Get('zone/:zoneId')
  async findByZone(@Param('zoneId') zoneId: string) {
    return this.reportsService.findByZone(zoneId);
  }
}
