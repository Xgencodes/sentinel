import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  BadRequestException,
} from '@nestjs/common';
import { z } from 'zod';
import { PatientsService } from './patients.service';
import { CreatePatientSchema, RecordConsentSchema } from '../dto';

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
