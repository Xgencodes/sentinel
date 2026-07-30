import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  LogTelemetryEmitter,
  InMemoryTelemetryEmitter,
  TelemetryEmitter,
} from '@ehr-bridge/sdk';

export const SENTINEL_TELEMETRY = Symbol('SENTINEL_TELEMETRY');

/**
 * Every module emits Sentinel events (see @ehr-bridge/sdk/telemetry) through
 * this single injected instance, so tests can swap in
 * InMemoryTelemetryEmitter and reconstruct a whole journey by correlationId.
 *
 * Global so it doesn't have to be re-imported into every feature module.
 */
@Global()
@Module({
  providers: [
    {
      provide: SENTINEL_TELEMETRY,
      useFactory: (config: ConfigService): TelemetryEmitter => {
        if (config.get<string>('TELEMETRY_MODE') === 'memory') {
          return new InMemoryTelemetryEmitter();
        }
        return new LogTelemetryEmitter();
      },
      inject: [ConfigService],
    },
  ],
  exports: [SENTINEL_TELEMETRY],
})
export class TelemetryModule {}
