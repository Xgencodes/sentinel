import { Controller, Post, Body, BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { AssessmentService } from '../reasoning/assessment.service';

const AssessSchema = z.object({
  patientId: z.string().uuid(),
  zoneId: z.string().uuid(),
  isAntenatal: z.boolean().default(false),
  prompt: z.string().min(1),
  language: z.string().default('en'),
  roadAccessible: z.boolean().default(true),
  correlationId: z.string().optional(),
});

@Controller('v1/assessments')
export class AssessmentController {
  constructor(private readonly assessmentService: AssessmentService) {}

  @Post()
  async assess(@Body() body: unknown) {
    try {
      const validated = AssessSchema.parse(body);
      return await this.assessmentService.assess(validated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new BadRequestException(error.issues.map((i) => i.message));
      }
      throw error;
    }
  }
}
