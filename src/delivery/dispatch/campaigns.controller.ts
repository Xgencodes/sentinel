import { Controller, Post, Body, BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { CohortResolverService } from '../../registry/cohort/cohort-resolver.service';
import { ProvidersService } from '../../registry/providers/providers.service';
import {
  OutboundDispatcherService,
  DispatchRecipient,
} from './outbound-dispatcher.service';

const LaunchCampaignSchema = z.object({
  zoneId: z.string().uuid(),
  cohortTypes: z
    .array(z.enum(['antenatal-care', 'under-five', 'chronic-condition']))
    .min(1),
  triggerZoneTriggerId: z.string().uuid().optional(),
  correlationId: z.string().optional(),
});

/**
 * Resolves a zone's cohort and their assigned CHWs, then dispatches the
 * outbound campaign to both — requirement 5: alerts go to patients in the
 * affected area *and* the CHWs covering them.
 */
@Controller('v1/campaigns')
export class CampaignsController {
  constructor(
    private readonly cohortResolver: CohortResolverService,
    private readonly providersService: ProvidersService,
    private readonly dispatcher: OutboundDispatcherService,
  ) {}

  @Post('dispatch')
  async dispatch(@Body() body: unknown) {
    try {
      const validated = LaunchCampaignSchema.parse(body);
      const resolved = await this.cohortResolver.resolve(
        validated.zoneId,
        validated.cohortTypes,
      );

      const patientRecipients: DispatchRecipient[] = resolved.cohorts.map(
        (c) => ({
          id: c.patientId,
          msisdn: c.msisdn,
          language: c.language,
          isChw: false,
        }),
      );

      const chwIds = [
        ...new Set(
          resolved.cohorts
            .map((c) => c.assignedChwId)
            .filter((id): id is string => id !== null),
        ),
      ];
      const chwRecipients: DispatchRecipient[] = [];
      for (const chwId of chwIds) {
        const chw = await this.providersService.findOne(chwId);
        chwRecipients.push({
          id: chw.id,
          msisdn: chw.phone,
          language: chw.languages[0] ?? 'en',
          isChw: true,
        });
      }

      return await this.dispatcher.dispatch(
        validated.zoneId,
        [...patientRecipients, ...chwRecipients],
        validated.triggerZoneTriggerId,
        validated.correlationId,
      );
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new BadRequestException(error.issues.map((i) => i.message));
      }
      throw error;
    }
  }
}
