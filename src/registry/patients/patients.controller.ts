import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  BadRequestException,
} from '@nestjs/common';
import { z } from 'zod';
import { PatientsService } from './patients.service';
import {
  CreatePatientSchema,
  RecordConsentSchema,
  UpdateHomeFacilitySchema,
} from '../dto';

@Controller('v1/registry/patients')
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Post()
  async create(@Body() body: unknown) {
    try {
      const validated = CreatePatientSchema.parse(body);
      return await this.patientsService.create(validated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new BadRequestException(error.issues.map((i) => i.message));
      }
      throw error;
    }
  }

  @Get()
  async findAll() {
    return this.patientsService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.patientsService.findOne(id);
  }

  /** Composite "current status" view: registry record + latest triage/escalation/placement + recent messages. */
  @Get(':id/status')
  async getStatus(@Param('id') id: string) {
    return this.patientsService.getStatus(id);
  }

  /** Sets/corrects a patient's home facility — the origin side of a record transfer. */
  @Patch(':id/home-facility')
  async updateHomeFacility(@Param('id') id: string, @Body() body: unknown) {
    try {
      const validated = UpdateHomeFacilitySchema.parse(body);
      return await this.patientsService.updateHomeFacility(
        id,
        validated.homeFacilityId,
      );
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new BadRequestException(error.issues.map((i) => i.message));
      }
      throw error;
    }
  }

  /** Marks monitoring/treatment as started at the receiving facility — post-placement. */
  @Post(':id/start-treatment')
  async startTreatment(
    @Param('id') id: string,
    @Body() body: { facilityId: string; correlationId?: string },
  ) {
    return this.patientsService.startTreatment(id, body.facilityId, body.correlationId);
  }

  @Post('consent')
  async recordConsent(@Body() body: unknown) {
    try {
      const validated = RecordConsentSchema.parse(body);
      return await this.patientsService.recordConsent(validated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new BadRequestException(error.issues.map((i) => i.message));
      }
      throw error;
    }
  }
}
