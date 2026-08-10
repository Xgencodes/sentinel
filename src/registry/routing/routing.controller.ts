import {
  Controller,
  Post,
  Patch,
  Param,
  Body,
  BadRequestException,
} from '@nestjs/common';
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
        validated.patientId,
        validated.correlationId,
      );
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new BadRequestException(error.issues.map((i) => i.message));
      }
      throw error;
    }
  }

  /** Marks a placement's record as transferred, once ehr-bridge confirms delivery. */
  @Patch('placements/:id/transferred')
  async markTransferred(@Param('id') id: string) {
    return this.facilityRouter.markTransferred(id);
  }

  /** Overrides the algorithm's destination facility for a placement. */
  @Patch('placements/:id')
  async overrideDestination(@Param('id') id: string, @Body() body: unknown) {
    const schema = z.object({ facilityId: z.string().uuid() });
    try {
      const validated = schema.parse(body);
      return await this.facilityRouter.overrideDestination(
        id,
        validated.facilityId,
      );
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new BadRequestException(error.issues.map((i) => i.message));
      }
      throw error;
    }
  }

  /** Records the treatment outcome for a placement — ongoing/recovered/referred. */
  @Patch('placements/:id/outcome')
  async updateOutcome(@Param('id') id: string, @Body() body: unknown) {
    const schema = z.object({
      status: z.enum(['ongoing', 'recovered', 'referred']),
    });
    try {
      const validated = schema.parse(body);
      return await this.facilityRouter.updateOutcome(id, validated.status);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new BadRequestException(error.issues.map((i) => i.message));
      }
      throw error;
    }
  }
}
