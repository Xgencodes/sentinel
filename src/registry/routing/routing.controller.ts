import { Controller, Post, Body, BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { FacilityRouterService } from './facility-router.service';
import { SelectFacilitySchema } from '../dto';

@Controller('v1/routing')
export class RoutingController {
  constructor(private readonly facilityRouter: FacilityRouterService) {}

  /**
   * Selects a receiving facility for a patient given their origin zone and
   * any required specialty. Does not itself transfer the patient's record —
   * that is ehr-bridge's job once a destination is chosen (link 8).
   */
  @Post('select-facility')
  async selectFacility(@Body() body: unknown) {
    try {
      const validated = SelectFacilitySchema.parse(body);
      return await this.facilityRouter.selectReceiving(
        validated.originZoneId,
        validated.requiredSpecialty,
      );
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new BadRequestException(error.issues.map((i) => i.message));
      }
      throw error;
    }
  }
}
