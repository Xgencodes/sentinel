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
import { FacilitiesService } from './facilities.service';
import { CreateFacilitySchema, UpdateBedsSchema } from '../dto';

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
}
