import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  BadRequestException,
} from '@nestjs/common';
import { z } from 'zod';
import { ZonesService } from './zones.service';
import { CreateZoneSchema } from '../dto';

@Controller('v1/registry/zones')
export class ZonesController {
  constructor(private readonly zonesService: ZonesService) {}

  @Post()
  async create(@Body() body: unknown) {
    try {
      const validated = CreateZoneSchema.parse(body);
      return await this.zonesService.create(validated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new BadRequestException(error.issues.map((i) => i.message));
      }
      throw error;
    }
  }

  @Get()
  async findAll() {
    return this.zonesService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.zonesService.findOne(id);
  }
}
