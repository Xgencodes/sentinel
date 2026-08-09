import { Controller, Post, Param, Body, BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { OutboundDispatcherService } from './outbound-dispatcher.service';

const ContactSchema = z.object({
  message: z.string().min(1),
  correlationId: z.string().optional(),
});

/**
 * Ad-hoc "message this CHW directly" action for the dashboard's provider
 * detail view — outside the campaign/cohort flow. Lives in delivery (not
 * registry, where ProvidersController is) because it needs SMS_ADAPTER,
 * which only delivery has.
 */
@Controller('v1/registry/providers')
export class ProviderContactController {
  constructor(private readonly dispatcher: OutboundDispatcherService) {}

  @Post(':id/contact')
  async contact(@Param('id') id: string, @Body() body: unknown) {
    try {
      const validated = ContactSchema.parse(body);
      return await this.dispatcher.contactChw(
        id,
        validated.message,
        validated.correlationId,
      );
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new BadRequestException(error.issues.map((i) => i.message));
      }
      throw error;
    }
  }
}
