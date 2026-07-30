import { Controller, Post, Body, BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { CohortResolverService } from './cohort-resolver.service';
import { ResolveCohortSchema } from '../dto';

@Controller('v1/cohorts')
export class CohortController {
  constructor(private readonly cohortResolver: CohortResolverService) {}

  @Post('resolve')
  async resolve(@Body() body: unknown) {
    try {
      const validated = ResolveCohortSchema.parse(body);
      return await this.cohortResolver.resolve(
        validated.zoneId,
        validated.cohortTypes,
      );
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new BadRequestException(error.issues.map((i) => i.message));
      }
      throw error;
    }
  }
}
