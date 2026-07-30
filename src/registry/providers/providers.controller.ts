import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { z } from 'zod';
import { ProvidersService } from './providers.service';
import { CreateProviderSchema } from '../dto';

@Controller('v1/registry/providers')
export class ProvidersController {
  constructor(private readonly providersService: ProvidersService) {}

  @Post()
  async create(@Body() body: unknown) {
    try {
      const validated = CreateProviderSchema.parse(body);
      return await this.providersService.create(validated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new BadRequestException(error.issues.map((i) => i.message));
      }
      throw error;
    }
  }

  @Get()
  async findAll(@Query('role') role?: 'doctor' | 'chw') {
    return this.providersService.findAll(role);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.providersService.findOne(id);
  }
}
