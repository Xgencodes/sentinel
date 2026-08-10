import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Param,
  Body,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { z } from 'zod';
import { FacilitiesService } from './facilities.service';
import { CreateFacilitySchema, UpdateBedsSchema } from '../dto';
import { AdminAuthGuard } from '../../common/admin-auth.guard';

@Controller('v1/registry/facilities')
export class FacilitiesController {
  constructor(private readonly facilitiesService: FacilitiesService) {}

  @Post()
  async create(@Body() body: unknown) {
    try {
      const validated = CreateFacilitySchema.parse(body);
      return await this.facilitiesService.create(validated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new BadRequestException(error.issues.map((i) => i.message));
      }
      throw error;
    }
  }

  @Get()
  async findAll() {
    return this.facilitiesService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.facilitiesService.findOne(id);
  }

  @Patch(':id/beds')
  async updateBeds(@Param('id') id: string, @Body() body: unknown) {
    try {
      const validated = UpdateBedsSchema.parse(body);
      return await this.facilitiesService.updateBeds(id, validated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new BadRequestException(error.issues.map((i) => i.message));
      }
      throw error;
    }
  }

  /**
   * The facility's own ehr-bridge partner identity — the one admin-gated
   * pair of routes in an otherwise unauthenticated reference deployment,
   * since this is the one place a real secret (an ehr-bridge partner
   * signing key) passes through sentinel. See FacilitiesService.getEhrIdentity.
   */
  @Get(':id/ehr-identity')
  @UseGuards(AdminAuthGuard)
  async getEhrIdentity(@Param('id') id: string) {
    return this.facilitiesService.getEhrIdentity(id);
  }

  @Put(':id/ehr-identity')
  @UseGuards(AdminAuthGuard)
  async setEhrIdentity(@Param('id') id: string, @Body() body: unknown) {
    const schema = z.object({
      ehrSystemId: z.string().min(1),
      partnerKey: z.string().min(1),
      secret: z.string().min(1),
    });
    try {
      const validated = schema.parse(body);
      return await this.facilitiesService.setEhrIdentity(id, validated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new BadRequestException(error.issues.map((i) => i.message));
      }
      throw error;
    }
  }
}
