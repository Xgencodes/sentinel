import { Controller, Get, Inject, Param } from '@nestjs/common';
import { InMemoryTelemetryEmitter, TelemetryEmitter } from '@ehr-bridge/sdk';
import { SENTINEL_TELEMETRY } from './telemetry.tokens';

/**
 * Exposes the in-memory telemetry timeline over HTTP so a dashboard can show
 * the "one correlationId threads every step" story on screen instead of
 * requiring someone to grep server logs. Only meaningful when
 * TELEMETRY_MODE=memory (see telemetry.module.ts) — with the default
 * LogTelemetryEmitter there is nothing in-process to query, so this
 * degrades to an empty list rather than erroring.
 */
@Controller('v1/telemetry')
export class TelemetryController {
  constructor(
    @Inject(SENTINEL_TELEMETRY) private readonly telemetry: TelemetryEmitter,
  ) {}

  @Get('timeline/:correlationId')
  timeline(@Param('correlationId') correlationId: string) {
    if (this.telemetry instanceof InMemoryTelemetryEmitter) {
      return this.telemetry.timeline(correlationId);
    }
    return [];
  }
}
